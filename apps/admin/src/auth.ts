import { Amplify } from "aws-amplify";

/**
 * OAuth redirect URLs must match the page origin where sign-in runs, or Amplify
 * throws "The oauth flow needs to be initiated from the same origin".
 * Register every URL you use (localhost, Amplify preview URLs, custom domain) in
 * Cognito → App client → Hosted UI → Allowed callback / sign-out URLs.
 */
function parseRedirectEnv(envName: string): string[] {
  const raw = import.meta.env[envName] as string | undefined;
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .map((value) => {
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Redirect URL must use http or https.");
        }
        return url.href;
      } catch {
        throw new Error(`${envName} must contain absolute URL values, for example http://localhost:5174/.`);
      }
    });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function oauthRedirects(): { signIn: string[]; signOut: string[] } {
  const origin = window.location.origin;
  const defaultSignIn = new URL("/", origin).href;
  const defaultSignOut = new URL("/", origin).href;

  return {
    signIn: unique([defaultSignIn, ...parseRedirectEnv("VITE_COGNITO_REDIRECT_SIGN_IN")]),
    signOut: unique([defaultSignOut, ...parseRedirectEnv("VITE_COGNITO_REDIRECT_SIGN_OUT")]),
  };
}

const { signIn, signOut } = oauthRedirects();
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const domain =
  (import.meta.env.VITE_COGNITO_DOMAIN as string | undefined) ??
  (import.meta.env.VITE_COGNITO_OAUTH_DOMAIN as string | undefined);

if (!userPoolClientId || !userPoolId || !domain) {
  throw new Error(
    "Admin app Cognito env is incomplete. Copy .env.example to .env at the repo root and set " +
      "VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_CLIENT_ID, and VITE_COGNITO_DOMAIN " +
      "(or VITE_COGNITO_OAUTH_DOMAIN). Values come from HCP Terraform outputs.",
  );
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolClientId,
      userPoolId,

      loginWith: {
        oauth: {
          domain,
          scopes: ["openid", "email"],
          redirectSignIn: signIn,
          redirectSignOut: signOut,
          responseType: "code", // PKCE
        },
      },
    },
  },
});

export function getCognitoSignOutRedirect(): string {
  return signOut[0];
}
