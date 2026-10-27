/**
 * fetch(), with a network failure or timeout as null rather than a throw.
 *
 * A throw escapes the route as a bare 500 with no JSON body, which the
 * storefronts can only read as "something went wrong, nothing changed". That
 * isn't always true (account deletion part-way through), so every upstream
 * call goes through here and each caller maps null to its own answer.
 */
export const tryFetch = async (
  input: string,
  init: RequestInit,
  step: string,
): Promise<Response | null> => {
  try {
    return await fetch(input, init);
  } catch (cause) {
    console.error(`${step}: request failed`, {
      error: cause instanceof Error ? cause.message : "unknown",
    });
    return null;
  }
};
