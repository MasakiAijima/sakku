import type {SeasonalArt} from './seasonal-art';

type KouId = SeasonalArt['assets'][number]['kouId'];
export type SeasonalArtKind = 'upcoming' | 'current' | 'visited';
export type SeasonalArtSlot = Readonly<{id: KouId; kind: SeasonalArtKind; completed: boolean}>;
export type SeasonalArtUpdate = Readonly<{
  year: number;
  slots: readonly SeasonalArtSlot[];
  reducedMotion: boolean;
  visible: boolean;
}>;
export type SeasonalArtController = {
  readonly ready: Promise<void>;
  update(state: SeasonalArtUpdate): void;
  select(id: KouId | null): void;
  dispose(): void;
};
export function mountSeasonalArt(options: {
  svg: SVGSVGElement;
  manifest: SeasonalArt;
  assetBase: string;
  onSelect: (id: KouId) => void;
  onStatus?: (status: string) => void;
  label?: (id: KouId, kind: SeasonalArtKind) => string;
}): SeasonalArtController;
