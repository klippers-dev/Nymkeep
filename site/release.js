// Public stable releases are discovered through GitHub's public API.
// Only the reviewed catalog emitted by the publication workflow enables downloads.
// catalog can contain that same validated catalog for a fully static deployment.
window.NYMKEEP_RELEASE = Object.freeze({
  discover: true,
  catalog: null,
});
