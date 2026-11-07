/** Content identity changes independently of scrolling and viewport geometry. */
let revision = 0;
export function invalidateContent() {
  revision++;
}
export function contentRevision() {
  return revision;
}
