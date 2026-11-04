/**
 * What an API route answers (401, code "signin") when the session ran out in
 * the middle of something. One string, so the screens that show API errors
 * can recognise it and offer a way to sign in.
 */
export const SIGN_IN_ERROR = "Sign in to keep going. It takes a few seconds.";

/** True when an error message is the expired-session one. */
export function needsSignIn(message: string | null | undefined): boolean {
  return message === SIGN_IN_ERROR;
}
