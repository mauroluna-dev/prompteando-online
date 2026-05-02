type Provider = "github" | "google";

async function postAuthForm(action: string, callbackUrl: string) {
  const csrfRes = await fetch("/auth/csrf", { credentials: "same-origin" });
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;

  const tokenInput = document.createElement("input");
  tokenInput.type = "hidden";
  tokenInput.name = "csrfToken";
  tokenInput.value = csrfToken;
  form.appendChild(tokenInput);

  const callbackInput = document.createElement("input");
  callbackInput.type = "hidden";
  callbackInput.name = "callbackUrl";
  callbackInput.value = callbackUrl;
  form.appendChild(callbackInput);

  document.body.appendChild(form);
  form.submit();
}

export function signInWith(provider: Provider, callbackUrl = "/") {
  return postAuthForm(`/auth/signin/${provider}`, callbackUrl);
}

export function signOut(callbackUrl = "/login") {
  return postAuthForm("/auth/signout", callbackUrl);
}
