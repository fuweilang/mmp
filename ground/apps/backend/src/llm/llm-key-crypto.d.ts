/** 加密上游 API Key；返回 v1:iv:tag:ciphertext（均为 base64url）。 */
export declare function encryptApiKey(plaintext: string): string;
/** 解密；仅服务端内部转发用，禁止回传前端。 */
export declare function decryptApiKey(blob: string): string;
/** 掩码提示：保留末 4 位。 */
export declare function maskApiKeyHint(plaintext: string): string;
//# sourceMappingURL=llm-key-crypto.d.ts.map