/**
 * Work whose failure must not stop the session.
 */

/**
 * Awaits work and swallows its failure: a hook that cannot do its bookkeeping
 * must still let the work go on, and a timer's work outlives its dispatch.
 * @param work the promise of the work
 */
export const quietly = async (work: Promise<unknown>): Promise<void> => {
  try {
    await work;
  } catch {
    // Nothing to tell: the session it would have drawn for is gone.
  }
};
