import { describe, expect, it } from "vitest";
import { publicAssetUrl } from "./publicAssetUrl";

describe("publicAssetUrl", () => {
  it("拼接 BASE_URL 与相对路径，并去掉重复斜杠", () => {
    const url = publicAssetUrl("data/ne_110m_admin_0_countries.geojson");
    expect(url.endsWith("data/ne_110m_admin_0_countries.geojson")).toBe(true);
    expect(publicAssetUrl("/data/borders.geojson")).not.toMatch(/\/{2,}data/);
  });
});
