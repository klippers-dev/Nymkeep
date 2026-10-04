export const repositoryName = "klippers-dev/Nymkeep";
export const requiredCheck = "Required checks";

export function protectionPolicies(ownerId, actionsId) {
  if (
    !Number.isSafeInteger(ownerId) ||
    ownerId <= 0 ||
    !Number.isSafeInteger(actionsId) ||
    actionsId <= 0
  )
    throw new Error("Verified owner and GitHub Actions IDs are required.");
  const conditions = {
    ref_name: {
      include: ["refs/heads/main", "refs/heads/stage", "refs/heads/dev"],
      exclude: [],
    },
  };
  return [
    {
      name: "Nymkeep - required CI and protected history",
      target: "branch",
      enforcement: "active",
      bypass_actors: [],
      conditions,
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        {
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: true,
            do_not_enforce_on_create: false,
            required_status_checks: [
              { context: requiredCheck, integration_id: actionsId },
            ],
          },
        },
      ],
    },
    {
      name: "Nymkeep - pull requests and owner review",
      target: "branch",
      enforcement: "active",
      bypass_actors: [
        { actor_id: ownerId, actor_type: "User", bypass_mode: "pull_request" },
      ],
      conditions,
      rules: [
        {
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["merge", "squash"],
            dismiss_stale_reviews_on_push: true,
            require_code_owner_review: true,
            require_last_push_approval: true,
            required_approving_review_count: 1,
            required_review_thread_resolution: true,
          },
        },
      ],
    },
    {
      name: "Nymkeep - release tags owned by maintainer",
      target: "tag",
      enforcement: "active",
      bypass_actors: [
        { actor_id: ownerId, actor_type: "User", bypass_mode: "always" },
      ],
      conditions: { ref_name: { include: ["refs/tags/v*"], exclude: [] } },
      rules: [
        { type: "creation" },
        {
          type: "update",
          parameters: { update_allows_fetch_and_merge: false },
        },
        { type: "deletion" },
        { type: "non_fast_forward" },
      ],
    },
  ];
}
