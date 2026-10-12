/** Retained import name for compatibility. Every annotated contribution type
 * survives; presentation chooses a colour without discarding filter metadata.
 * Legacy records without probabilities keep their source order. */
export function firstTypeRelations(relations) {
  return Array.isArray(relations) ? relations : [];
}
