import { describe, expect, it } from "vitest";
import { bytesToHex } from "./upload";
import { sha256Bytes } from "./sha256";

const enc = (s: string) => new TextEncoder().encode(s);

describe("sha256 fallback (plain-http phones have no crypto.subtle)", () => {
  it("matches the FIPS 180-4 test vectors", () => {
    expect(bytesToHex(sha256Bytes(enc("")))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(bytesToHex(sha256Bytes(enc("abc")))).toBe("ba7816bf8f01cfee414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(bytesToHex(sha256Bytes(enc("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")))).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });
  it("matches crypto.subtle on inputs that cross block boundaries", async () => {
    for (const n of [55, 56, 63, 64, 65, 127, 1000, 70000]) {
      const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
      const want = bytesToHex(await crypto.subtle.digest("SHA-256", data));
      expect(bytesToHex(sha256Bytes(data))).toBe(want);
    }
  });
});
