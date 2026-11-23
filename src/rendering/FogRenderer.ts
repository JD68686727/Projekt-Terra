import { BufferImageSource, Sprite, Texture } from 'pixi.js';
import { FOG_CELL, FogMap } from '../world/FogMap';
import { hash01, valueNoise } from '../world/rng';

/**
 * Draws the fog of war as one low-res texture with linear filtering, which
 * turns the coarse grid into soft, cloudy edges. Unrevealed texels carry a
 * mottled deep-violet colour so the fog reads as atmosphere, not a black box.
 * Only changed rows are re-uploaded.
 */
export class FogRenderer {
  readonly sprite: Sprite;
  private readonly px: Uint8Array;
  private readonly source: BufferImageSource;

  constructor(private readonly fog: FogMap, seed: number) {
    const { fw, fh } = fog;
    this.px = new Uint8Array(fw * fh * 4);
    // Static colour field; only alpha changes when revealed.
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const p = (y * fw + x) * 4;
        const n = valueNoise(x / 6, y / 6, seed ^ 0xf09) * 0.6 + hash01(x, y, seed ^ 0xf0a) * 0.4;
        this.px[p] = 10 + n * 14;
        this.px[p + 1] = 8 + n * 8;
        this.px[p + 2] = 20 + n * 22;
      }
    }
    this.source = new BufferImageSource({ resource: this.px, width: fw, height: fh, scaleMode: 'linear', autoGenerateMipmaps: false });
    this.sprite = new Sprite(new Texture({ source: this.source }));
    this.sprite.scale.set(FOG_CELL);
    this.sprite.label = 'fog';
    fog.markAllDirty();
    this.update();
  }

  update(): void {
    const rows = this.fog.takeDirtyRows();
    if (!rows) return;
    const { fw, data } = this.fog;
    for (let y = rows[0]; y <= rows[1]; y++) {
      for (let x = 0; x < fw; x++) {
        const i = y * fw + x;
        // Slight alpha variation makes the fog look cloudy under linear filtering.
        this.px[i * 4 + 3] = data[i] ? 0 : 232 + ((x * 7 + y * 13) % 20);
      }
    }
    this.source.update(rows[0] * fw, (rows[1] + 1) * fw);
  }
}
