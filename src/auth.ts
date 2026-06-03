import { Amplify } from "aws-amplify";
import {
  appOrigin,
  cognitoClientId,
  cognitoOAuthDomain,
  cognitoUserPoolId,
} from "./lib/env";

/**
 * OAuth redirect URLs must match the page origin where sign-in runs, or Amplify
 * throws "The oauth flow needs to be initiated from the same origin".
 * Register every URL you use (localhost, CloudFront, custom domain) in
 * Cognito → App client → Hosted UI → Allowed callback / sign-out URLs.
 */
function oauthRedirects(): { signIn: string[]; signOut: string[] } {
  const origin = appOrigin();
  return {
    signIn: [`${origin}/admin`],
    signOut: [`${origin}/`],
  };
}

const { signIn, signOut } = oauthRedirects();

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolClientId: cognitoClientId(),
      userPoolId: cognitoUserPoolId(),
      loginWith: {
        oauth: {
          domain: cognitoOAuthDomain(),
          scopes: ["openid", "email"],
          redirectSignIn: signIn,
          redirectSignOut: signOut,
          responseType: "code",
        },
      },
    },
  },
});
