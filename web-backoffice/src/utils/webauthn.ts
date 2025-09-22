export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function publicKeyCredentialCreationOptionsFromJSON(options: any): PublicKeyCredentialCreationOptions {
  const publicKey = { ...options } as PublicKeyCredentialCreationOptions;
  if (publicKey.challenge) {
    publicKey.challenge = base64UrlToBuffer(publicKey.challenge as unknown as string);
  }
  if (publicKey.user) {
    publicKey.user = { ...publicKey.user, id: base64UrlToBuffer((publicKey.user as any).id) };
  }
  if (publicKey.excludeCredentials) {
    publicKey.excludeCredentials = publicKey.excludeCredentials.map((cred) => ({
      ...cred,
      id: base64UrlToBuffer(cred.id as unknown as string)
    }));
  }
  return publicKey;
}

export function publicKeyCredentialRequestOptionsFromJSON(options: any): PublicKeyCredentialRequestOptions {
  const publicKey = { ...options } as PublicKeyCredentialRequestOptions;
  if (publicKey.challenge) {
    publicKey.challenge = base64UrlToBuffer(publicKey.challenge as unknown as string);
  }
  if (publicKey.allowCredentials) {
    publicKey.allowCredentials = publicKey.allowCredentials.map((cred) => ({
      ...cred,
      id: base64UrlToBuffer(cred.id as unknown as string)
    }));
  }
  return publicKey;
}

export function credentialToJSON(credential: PublicKeyCredential): Record<string, any> {
  const json: Record<string, any> = {
    id: credential.id,
    type: credential.type,
    rawId: bufferToBase64Url(credential.rawId)
  };

  const response = credential.response as AuthenticatorAttestationResponse | AuthenticatorAssertionResponse;
  json.response = {
    clientDataJSON: bufferToBase64Url(response.clientDataJSON)
  };
  if ('attestationObject' in response) {
    const attestationResponse = response as AuthenticatorAttestationResponse;
    json.response.attestationObject = bufferToBase64Url(attestationResponse.attestationObject);
  }
  if ('authenticatorData' in response) {
    const assertionResponse = response as AuthenticatorAssertionResponse;
    json.response.authenticatorData = bufferToBase64Url(assertionResponse.authenticatorData);
  }
  if ('signature' in response) {
    const assertionResponse = response as AuthenticatorAssertionResponse;
    json.response.signature = bufferToBase64Url(assertionResponse.signature);
  }
  if ('userHandle' in response) {
    const assertionResponse = response as AuthenticatorAssertionResponse;
    if (assertionResponse.userHandle) {
      json.response.userHandle = bufferToBase64Url(assertionResponse.userHandle);
    }
  }

  if ('clientExtensionResults' in credential) {
    json.clientExtensionResults = credential.getClientExtensionResults();
  }

  return json;
}
