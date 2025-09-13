import { GoogleGenAI, Type } from "@google/genai";
import type { ViralIdea, SceneTimeline } from "../types";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateViralIdeas = async (prompt: string): Promise<ViralIdea[]> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nomor: { type: Type.NUMBER, description: "Nomor urut ide" },
              judul: { type: Type.STRING, description: "Judul video yang menarik" },
              deskripsi: { type: Type.STRING, description: "Deskripsi singkat tentang ide konten" },
            },
            required: ['nomor', 'judul', 'deskripsi'],
          },
        },
      }
    });

    const jsonText = response.text.trim();
    const ideas = JSON.parse(jsonText);
    return ideas;

  // FIX: Added curly braces to the catch block to fix a syntax error.
  } catch (error) {
    console.error("Error generating viral ideas:", error);
    throw new Error("Gagal membuat ide viral. Silakan periksa konsol untuk detail.");
  }
};

export const generateSceneTimeline = async (narration: string, duration: number): Promise<SceneTimeline[]> => {
  const prompt = `Analisis narasi berikut untuk video berdurasi total ${duration} detik dan pecah menjadi tabel timeline adegan yang detail.

Narasi:
"${narration}"

ATURAN PENTING: Setiap adegan HARUS memiliki durasi antara 5 hingga 8 detik. Distribusikan total waktu ${duration} detik ke dalam adegan-adegan yang memenuhi aturan durasi ini.

Berikan output dalam format JSON berupa array objek. Setiap objek harus memiliki properti:
1. "timeline": (string) Estimasi rentang waktu untuk adegan ini. Format: "0s - 5s". Pastikan durasi (waktu akhir - waktu mulai) antara 5 dan 8 detik.
2. "adegan": (string) Deskripsi visual singkat untuk adegan tersebut.
3. "narasiAdegan": (string) Kutipan narasi yang relevan untuk adegan ini.
4. "promptGambar": (string) Prompt deskriptif untuk generator gambar AI. PENTING: Untuk menjaga konsistensi visual, tambahkan frasa ", in a consistent cinematic, hyper-realistic art style, dramatic lighting" di akhir setiap prompt gambar.
5. "promptVideo": (string) Prompt singkat untuk generator video AI yang menganimasikan gambar tersebut.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              timeline: { type: Type.STRING, description: "Estimasi waktu adegan dalam format 'Xs - Ys'." },
              adegan: { type: Type.STRING, description: "Deskripsi visual untuk adegan tersebut." },
              narasiAdegan: { type: Type.STRING, description: "Bagian narasi yang sesuai untuk adegan ini." },
              promptGambar: { type: Type.STRING, description: "Prompt untuk menghasilkan gambar adegan dengan gaya yang konsisten." },
              promptVideo: { type: Type.STRING, description: "Prompt untuk menganimasikan gambar adegan." },
            },
            required: ['timeline', 'adegan', 'narasiAdegan', 'promptGambar', 'promptVideo'],
          },
        },
      },
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText);

  } catch (error) {
    console.error("Error generating scene timeline:", error);
    throw new Error("Gagal membuat timeline adegan. Silakan periksa konsol untuk detail.");
  }
};


export const generateNarration = async (prompt: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.95,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error generating narration:", error);
    throw new Error("Failed to generate narration. Please check the console for details.");
  }
};

export const generateImage = async (prompt: string, aspectRatio: '1:1' | '9:16' | '16:9' | '4:3' | '3:4' = '1:1'): Promise<string> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: aspectRatio,
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
      return `data:image/png;base64,${base64ImageBytes}`;
    }
    throw new Error("No image was generated.");

  } catch (error: any) {
    console.error(`Error generating image for prompt "${prompt}":`, error);
    throw new Error(error.message || `Failed to generate image for prompt: "${prompt}".`);
  }
};


export const generateVideoFromImage = async (prompt: string, imageBase64: string, mimeType: string, model: string) => {
  try {
     let operation = await ai.models.generateVideos({
        model: model,
        prompt: prompt,
        image: {
            imageBytes: imageBase64,
            mimeType: mimeType,
        },
        config: {
            numberOfVideos: 1,
        }
    });
    
    return operation;
  } catch (error) {
    console.error("Error starting video generation:", error);
    throw new Error("Failed to start video generation process.");
  }
};

export const checkVideoOperationStatus = async (operation: any) => {
    try {
        const updatedOperation = await ai.operations.getVideosOperation({ operation: operation });
        return updatedOperation;
    } catch (error) {
        console.error("Error checking video operation status:", error);
        throw new Error("Failed to check video generation status.");
    }
}