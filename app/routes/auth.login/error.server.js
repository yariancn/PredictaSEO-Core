import { LoginErrorType } from "@shopify/shopify-app-remix/server";

export function loginErrorMessage(loginErrors) {
  if (!loginErrors || loginErrors instanceof Response) {
    return { hasErrors: false };
  }

  if (
    loginErrors?.shop === LoginErrorType.MissingShop ||
    loginErrors?.shop === LoginErrorType.InvalidShop
  ) {
    return { hasErrors: true };
  }

  return { hasErrors: false };
}
