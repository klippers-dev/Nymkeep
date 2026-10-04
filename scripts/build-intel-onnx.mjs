import { execFileSync } from "node:child_process";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { repository } from "./release/prepare.mjs";
import { intelRuntimeArchives } from "./release/intel-onnx-libs.mjs";

const revision = "da9b5e364c465de65c49d91e696cd6485270757f";
const root = resolve(repository, ".release-work/onnxruntime-intel");
if (process.platform !== "darwin" || process.arch !== "x64")
  throw new Error("This build is only for an Intel Mac host.");
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: "inherit" });
if (
  !(await access(resolve(root, ".git")).then(
    () => true,
    () => false,
  ))
) {
  await mkdir(resolve(repository, ".release-work"), { recursive: true });
  run(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "--branch",
      "v1.28.0",
      "--recursive",
      "https://github.com/microsoft/onnxruntime.git",
      root,
    ],
    repository,
  );
}
const actual = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (actual !== revision)
  throw new Error("Unexpected Intel runtime source revision.");
const definitions = [
  "CMAKE_OSX_ARCHITECTURES=x86_64",
  "CMAKE_OSX_DEPLOYMENT_TARGET=13.3",
  "onnxruntime_BUILD_UNIT_TESTS=OFF",
  "BUILD_SHARED_LIBS=OFF",
  "FETCHCONTENT_TRY_FIND_PACKAGE_MODE=NEVER",
];
const recipe = JSON.stringify({ revision, definitions, profile: "Release" });
const stamp = resolve(root, "nymkeep-recipe.json");
if ((await readFile(stamp, "utf8").catch(() => "")) !== recipe) {
  run("bash", [
    "build.sh",
    "--config",
    "Release",
    "--update",
    "--build",
    "--skip_tests",
    "--parallel",
    String(Math.min(4, availableParallelism())),
    "--compile_no_warning_as_error",
    "--build_dir",
    resolve(root, "build"),
    "--cmake_extra_defines",
    ...definitions,
  ]);
  run("cmake", [
    "--build",
    resolve(root, "build/Release"),
    "--target",
    "re2",
    "--parallel",
    String(Math.min(4, availableParallelism())),
  ]);
}
await access(resolve(root, "build/Release/libonnxruntime_session.a"));
const output = resolve(root, "nymkeep-lib");
await mkdir(output, { recursive: true });
const archive = resolve(output, "libonnxruntime.a");
const inputs = await intelRuntimeArchives(resolve(root, "build/Release"));
run("xcrun", ["libtool", "-static", "-o", `${archive}.tmp`, ...inputs]);
await rename(`${archive}.tmp`, archive);
await writeFile(stamp, recipe);
const variables = `ORT_LIB_PATH=${output}\nORT_LIB_PROFILE=Release\n`;
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, variables);
console.log(`Intel ONNX Runtime 1.28.0 (${revision}) ready.\n${variables}`);
