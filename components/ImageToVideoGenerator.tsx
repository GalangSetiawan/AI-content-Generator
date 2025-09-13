import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateVideoFromImage, checkVideoOperationStatus } from '../services/geminiService';
import type { ImageForVideo } from '../types';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';
import { UploadIcon } from './icons/UploadIcon';

const LOADING_MESSAGES = [
    "Memulai proses pembuatan video...",
    "Mengirim data ke server AI...",
    "AI sedang menganalisis gambar dan prompt...",
    "Membuat frame-frame awal...",
    "Merender adegan video...",
    "Menambahkan detail dan animasi...",
    "Hampir selesai, memfinalisasi video...",
    "Mengambil hasil video...",
];

interface ImageToVideoGeneratorProps {
  imagesForVideo: ImageForVideo[];
  setImagesForVideo: (images: ImageForVideo[]) => void;
}

const parseTimelineDuration = (timelineStr: string): number => {
    if (!timelineStr) return 4; 

    const matches = timelineStr.match(/(\d+)\s*[sd]?\s*-\s*(\d+)\s*[sd]?/);
    
    if (matches && matches.length === 3) {
        try {
            const start = parseInt(matches[1], 10);
            const end = parseInt(matches[2], 10);
            const duration = end - start;

            // Clamp the duration to be within the slider's range [1, 20]
            return Math.max(1, Math.min(20, duration));
        } catch (e) {
            console.error("Error parsing timeline duration:", e);
            return 4; // Default on parsing error
        }
    }

    return 4; // Default if format doesn't match
};

const ImageToVideoGenerator: React.FC<ImageToVideoGeneratorProps> = ({ imagesForVideo, setImagesForVideo }) => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageBase64, setImageBase64] = useState<string>('');
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [prompt, setPrompt] = useState<string>('');
    const [videoUrl, setVideoUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [loadingMessage, setLoadingMessage] = useState<string>('');
    const poller = useRef<NodeJS.Timeout | null>(null);

    // New state for configuration
    const [model, setModel] = useState<string>('veo-2.0-generate-001');
    const [aspectRatio, setAspectRatio] = useState<string>('9:16');
    const [duration, setDuration] = useState<number>(4);

    const cleanup = useCallback(() => {
        if (poller.current) {
            clearInterval(poller.current);
            poller.current = null;
        }
    }, []);

    useEffect(() => {
        return () => cleanup();
    }, [cleanup]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                setImageBase64(base64String);
                setPreviewUrl(URL.createObjectURL(file));
                setError('');
                setVideoUrl('');
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSelectImageFromList = useCallback(async (selectedImage: ImageForVideo, index: number) => {
        setVideoUrl('');
        setError('');
        setPrompt(selectedImage.promptVideo);
        setPreviewUrl(selectedImage.imageUrl);

        const calculatedDuration = parseTimelineDuration(selectedImage.timeline);
        setDuration(calculatedDuration);

        try {
            const response = await fetch(selectedImage.imageUrl);
            const blob = await response.blob();
            const file = new File([blob], `scene_${index}.png`, { type: blob.type });
            setImageFile(file);

            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                setImageBase64(base64String);
            };
            reader.readAsDataURL(file);

        } catch (e) {
            console.error("Gagal memproses gambar dari daftar:", e);
            setError("Gagal memuat gambar yang dipilih.");
        }
    }, []);


    const pollOperation = useCallback(async (operation: any) => {
        poller.current = setInterval(async () => {
             try {
                const updatedOperation = await checkVideoOperationStatus(operation);
                if (updatedOperation.done) {
                    cleanup();
                    if(updatedOperation.response?.generatedVideos?.[0]?.video?.uri) {
                        const downloadLink = updatedOperation.response.generatedVideos[0].video.uri;
                        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
                        const blob = await response.blob();
                        setVideoUrl(URL.createObjectURL(blob));
                    } else {
                         setError("Video berhasil dibuat, tetapi gagal mengambil data. Coba lagi.");
                    }
                    setIsLoading(false);
                }
             } catch (err: any) {
                 setError(err.message || 'Gagal memeriksa status pembuatan video.');
                 setIsLoading(false);
                 cleanup();
             }
        }, 10000);
    }, [cleanup]);

    const handleGenerate = useCallback(async () => {
        if (!imageFile || !prompt.trim()) {
            setError('Silakan unggah gambar dan masukkan prompt.');
            return;
        }
        setIsLoading(true);
        setError('');
        setVideoUrl('');
        
        let messageIndex = 0;
        const messageInterval = setInterval(() => {
            setLoadingMessage(LOADING_MESSAGES[messageIndex % LOADING_MESSAGES.length]);
            messageIndex++;
        }, 3000);
        
        try {
            // Pass model to the service function. Aspect ratio and duration are for UI only for now.
            const operation = await generateVideoFromImage(prompt, imageBase64, imageFile.type, model);
            await pollOperation(operation);
        } catch (err: any) {
            setError(err.message || 'Terjadi kesalahan saat memulai pembuatan video.');
            setIsLoading(false);
        } finally {
            clearInterval(messageInterval);
        }
    }, [imageFile, prompt, imageBase64, model, pollOperation]);

    return (
        <div className="max-w-4xl mx-auto">
             <div className="p-1 bg-gradient-to-r from-red-500 to-yellow-500 rounded-xl">
              <div className="bg-gray-950 p-6 rounded-lg">
                 <h2 className="text-3xl font-bold text-white mb-2">Image to Video Generator</h2>
                 <p className="text-gray-400">Ubah gambar statis Anda menjadi video dinamis dengan kekuatan AI.</p>
              </div>
            </div>

            {imagesForVideo && imagesForVideo.length > 0 && (
            <div className="mt-8">
              <h3 className="text-xl font-bold text-white mb-4">Gambar dari Timeline</h3>
              <p className="text-sm text-gray-400 mb-4">Klik pada salah satu adegan di bawah ini untuk memuat gambar dan prompt-nya secara otomatis ke dalam formulir.</p>
              <div className="flex flex-col gap-3 max-h-72 overflow-y-auto p-3 bg-gray-950 rounded-lg border border-gray-700">
                {imagesForVideo.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectImageFromList(img, index)}
                    className="flex items-center gap-4 p-2 bg-gray-800 rounded-lg hover:bg-gray-700 focus:ring-2 focus:ring-red-500 focus:outline-none transition-all duration-200 w-full text-left"
                  >
                    <img src={img.imageUrl} alt={img.adegan} className="w-16 h-28 object-cover rounded-md flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{img.adegan}</p>
                      <p className="text-gray-400 text-xs mt-1">Prompt: <span className="font-mono text-amber-300">{img.promptVideo}</span></p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            )}

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-6">
                    <div>
                        <label className="text-sm font-medium text-gray-300 mb-2 block">1. Unggah Gambar</label>
                        <div className="w-full h-64 bg-gray-800 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center relative">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={isLoading}
                                aria-label="Unggah Gambar"
                            />
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain rounded-lg p-2" />
                            ) : (
                                <div className="text-center text-gray-500 pointer-events-none">
                                    <UploadIcon />
                                    <p>Klik atau seret untuk mengunggah</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="prompt-video" className="text-sm font-medium text-gray-300 mb-2 block">2. Tulis Prompt Animasi</label>
                        <textarea
                            id="prompt-video"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Contoh: buat mobil ini melaju di jalanan kota cyberpunk..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 focus:ring-2 focus:ring-red-500 focus:outline-none transition-colors duration-200 text-gray-200"
                            rows={3}
                            disabled={isLoading}
                        />
                    </div>

                    <div className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-950/50">
                        <h3 className="text-base font-semibold text-gray-200 -mt-1">Konfigurasi Video</h3>
                        
                        <div>
                            <label htmlFor="model-select" className="text-sm font-medium text-gray-300 mb-2 block">Model Video</label>
                            <select 
                                id="model-select" 
                                value={model} 
                                onChange={e => setModel(e.target.value)} 
                                disabled={isLoading} 
                                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none transition-colors duration-200 text-gray-200"
                            >
                                <option value="veo-2.0-generate-001">VEO 2.0</option>
                            </select>
                        </div>

                        <div>
                            <label htmlFor="aspect-ratio-select" className="text-sm font-medium text-gray-300 mb-2 block">Aspect Ratio</label>
                            <select 
                                id="aspect-ratio-select" 
                                value={aspectRatio} 
                                onChange={e => setAspectRatio(e.target.value)} 
                                disabled={isLoading} 
                                className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2.5 focus:ring-2 focus:ring-red-500 focus:outline-none transition-colors duration-200 text-gray-200"
                            >
                                <option value="9:16">9:16 (Potret)</option>
                                <option value="16:9">16:9 (Lanskap)</option>
                                <option value="1:1">1:1 (Persegi)</option>
                                <option value="4:3">4:3</option>
                                <option value="3:4">3:4</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Catatan: Fitur ini belum didukung oleh model saat ini.</p>
                        </div>

                        <div>
                            <label htmlFor="duration-slider" className="text-sm font-medium text-gray-300 mb-2 block">Durasi Video ({duration} detik)</label>
                            <input
                                id="duration-slider"
                                type="range"
                                min="1"
                                max="20"
                                step="1"
                                value={duration}
                                onChange={e => setDuration(parseInt(e.target.value, 10))}
                                disabled={isLoading}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500 disabled:opacity-50"
                            />
                             <p className="text-xs text-gray-500 mt-1">Catatan: Fitur ini belum didukung oleh model saat ini.</p>
                        </div>
                    </div>
                    
                    {error && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{error}</p>}

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !imageFile || !prompt}
                        className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-red-700 disabled:bg-red-900 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
                        >
                        {isLoading ? <><Spinner size="5" color="white" /> Generating...</> : <><SparklesIcon /> Generate Video</>}
                    </button>
                </div>

                <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Hasil Video</label>
                    <div className="w-full aspect-[9/16] bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                        {isLoading ? (
                            <div className="text-center p-4">
                                <Spinner size="12" color="red-500" />
                                <p className="mt-4 text-gray-400 text-sm">{loadingMessage || 'Mohon tunggu, proses ini bisa memakan waktu beberapa menit...'}</p>
                            </div>
                        ) : videoUrl ? (
                            <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
                        ) : (
                            <p className="text-gray-500">Video Anda akan muncul di sini</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageToVideoGenerator;