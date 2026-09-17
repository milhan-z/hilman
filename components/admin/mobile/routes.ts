/**
 * Which screens are a document rather than a list.
 *
 * Two pieces of chrome need to agree on this: the global header hides inside
 * an editor, and the bottom tab bar does too, because on those screens the
 * bottom of the phone belongs to Save and Publish. Defining it twice is how
 * they would eventually disagree about `/admin/pages/about`.
 */
export const EDITOR_ROUTE =
  /^\/admin\/(?:projects|journal)\/[^/]+$|^\/admin\/pages\/[^/]+$/;
