export type Tab = 'narasi' | 'gambar' | 'video';

export interface GeneratedImage {
  prompt: string;
  imageUrl: string;
  error?: string;
}

export interface SceneTimeline {
  timeline: string;
  adegan: string;
  narasiAdegan: string;
  promptGambar: string;
  promptVideo: string;
  imageUrl?: string;
}

export type TimelineItemState = SceneTimeline & {
    isGenerating?: boolean;
    generationError?: string | null;
};

export interface ViralIdea {
  nomor: number;
  judul: string;
  deskripsi: string;
  narasi?: string;
  timeline?: TimelineItemState[];
}

export interface ImageForVideo {
  imageUrl: string;
  promptVideo: string;
  adegan: string;
  timeline: string;
}