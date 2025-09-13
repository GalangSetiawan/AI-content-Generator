import React, { useState, useCallback, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { generateNarration, generateViralIdeas, generateSceneTimeline, generateImage } from '../services/geminiService';
import type { ViralIdea, ImageForVideo, Tab, TimelineItemState } from '../types';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';
import { CogIcon } from './icons/CogIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { SendIcon } from './icons/SendIcon';
import { HistoryIcon } from './icons/HistoryIcon';

const DEFAULT_IDEA_PROMPT_TEMPLATE = `Buatkan saya list {numberOfIdeas} judul dan tema untuk video berdurasi {videoDuration} detik dengan topik {viralTopic}. Buat dalam format JSON dengan struktur array of objects, di mana setiap object memiliki properti 'nomor' (number), 'judul' (string), dan 'deskripsi' (string). Pastikan judulnya clickbait, menarik, dan relevan dengan topik.`;

const RATE_LIMIT = 25; // Images per minute
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in ms

interface NarrationGeneratorProps {
  setImagesForVideo: (images: ImageForVideo[]) => void;
  setActiveTab: (tab: Tab) => void;
}

const sanitizeTimelineToFilename = (timelineStr: string): string => {
    if (!timelineStr) return `scene_${Date.now()}`;
    return timelineStr
        .replace(/s/g, '') // remove 's'
        .trim()
        .replace(/\s*-\s*/g, '_sampai_')
        .replace(/\s/g, '_')
        + '_detik';
};

const parseTimelineDuration = (timelineStr: string): number | null => {
    if (!timelineStr) return null;
    const matches = timelineStr.match(/(\d+)\s*s\s*-\s*(\d+)\s*s/);
    if (matches && matches.length === 3) {
        try {
            const start = parseInt(matches[1], 10);
            const end = parseInt(matches[2], 10);
            return end - start;
        } catch {
            return null;
        }
    }
    return null;
};


const NarrationGenerator: React.FC<NarrationGeneratorProps> = ({ setImagesForVideo, setActiveTab }) => {
  const narrationSectionRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  const [viralTopic, setViralTopic] = useState<string>('sejarah, fakta yang jarang di ketauhi, informasi tertutup yang bocor ke publik seputar');
  const [ideaHistory, setIdeaHistory] = useState<Record<string, ViralIdea[]>>({});
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState<boolean>(false);
  const [isGeneratingMoreIdeas, setIsGeneratingMoreIdeas] = useState<boolean>(false);
  const [ideaError, setIdeaError] = useState<string>('');
  
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [numberOfIdeas, setNumberOfIdeas] = useState<number>(20);
  const [videoDuration, setVideoDuration] = useState<number>(90);
  const [ideaPromptTemplate, setIdeaPromptTemplate] = useState<string>(DEFAULT_IDEA_PROMPT_TEMPLATE);

  const [prompt, setPrompt] = useState<string>('');
  const [activeIdeaId, setActiveIdeaId] = useState<number | null>(null);
  const [isGeneratingTimeline, setIsGeneratingTimeline] = useState<boolean>(false);
  const [timelineError, setTimelineError] = useState<string>('');
  const [isZipping, setIsZipping] = useState<boolean>(false);
  
  // Rate limiting state
  const [requestTimestamps, setRequestTimestamps] = useState<number[]>([]);
  const [rateLimitError, setRateLimitError] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  const [dailyQuotaError, setDailyQuotaError] = useState<string>('');

  const viralIdeas = activeTopic ? ideaHistory[activeTopic] || [] : [];
  const activeIdea = viralIdeas.find(idea => idea.nomor === activeIdeaId);
  const activeTimeline = activeIdea?.timeline || [];

  const hasFailedGenerations = activeTimeline.some(item => !!item.generationError && !item.imageUrl);
  const isAnyImageGenerating = activeTimeline.some(item => !!item.isGenerating);
  const allImagesGenerated = activeTimeline.length > 0 && activeTimeline.every(item => !!item.imageUrl);

  // Effect for countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else {
        setRateLimitError(''); // Clear error when countdown finishes
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Effect for closing history dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
            setIsHistoryOpen(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleGenerateIdeas = useCallback(async () => {
    if (!viralTopic.trim()) {
        setIdeaError('Topik tidak boleh kosong.');
        return;
    }
    setIsGeneratingIdeas(true);
    setIdeaError('');
    setActiveIdeaId(null);
    try {
        const finalPrompt = ideaPromptTemplate
            .replace('{numberOfIdeas}', String(numberOfIdeas))
            .replace('{videoDuration}', String(videoDuration))
            .replace('{viralTopic}', viralTopic);

        const result = await generateViralIdeas(finalPrompt);
        
        const newIdeas = result.map(idea => ({ ...idea, timeline: [] }));
        setIdeaHistory(prevHistory => {
            const existingIdeas = prevHistory[viralTopic] || [];
            return {
                ...prevHistory,
                [viralTopic]: [...existingIdeas, ...newIdeas]
            };
        });
        setActiveTopic(viralTopic);

    } catch (err: any) {
        setIdeaError(err.message || 'Terjadi kesalahan saat membuat ide.');
    } finally {
        setIsGeneratingIdeas(false);
    }
  }, [viralTopic, numberOfIdeas, videoDuration, ideaPromptTemplate]);
  
  const handleGenerateMoreIdeas = useCallback(async () => {
    if (!activeTopic) return;

    setIsGeneratingMoreIdeas(true);
    setIdeaError('');

    try {
        const existingIdeas = ideaHistory[activeTopic] || [];
        const existingTitles = existingIdeas.map(idea => idea.judul).join('\n- ');
        
        const exclusionPromptPart = existingTitles.length > 0
            ? `\n\nPENTING: Jangan membuat ulang ide dengan judul yang mirip dengan yang ada di daftar ini:\n- ${existingTitles}`
            : '';

        const finalPrompt = `Buatkan saya list 10 judul dan tema BARU untuk video berdurasi ${videoDuration} detik dengan topik ${viralTopic}.${exclusionPromptPart}\n\nBuat dalam format JSON dengan struktur array of objects, di mana setiap object memiliki properti 'nomor' (number), 'judul' (string), dan 'deskripsi' (string). Pastikan judulnya clickbait, menarik, dan relevan dengan topik.`;

        const result = await generateViralIdeas(finalPrompt);
        
        const maxNomor = Math.max(0, ...existingIdeas.map(idea => idea.nomor));

        const newIdeas = result.map((idea, index) => ({
            ...idea,
            nomor: maxNomor + 1 + index,
            timeline: []
        }));

        setIdeaHistory(prevHistory => ({
            ...prevHistory,
            [activeTopic]: [...existingIdeas, ...newIdeas]
        }));

    } catch (err: any) {
        setIdeaError(err.message || 'Terjadi kesalahan saat membuat ide tambahan.');
    } finally {
        setIsGeneratingMoreIdeas(false);
    }
  }, [activeTopic, ideaHistory, videoDuration, viralTopic]);


  const generateFullTimeline = useCallback(async (promptToUse: string, ideaId: number) => {
    if (!promptToUse.trim() || !activeTopic) {
        setTimelineError('Prompt atau topik aktif tidak boleh kosong.');
        return;
    }
    setIsGeneratingTimeline(true);
    setTimelineError('');
    setActiveIdeaId(ideaId);
    
    try {
        const narrationText = await generateNarration(promptToUse);
        const timelineResult = await generateSceneTimeline(narrationText, videoDuration);
        
        const newTimeline: TimelineItemState[] = timelineResult.map(scene => ({ ...scene, imageUrl: undefined, isGenerating: false, generationError: null }));
        
        setIdeaHistory(prevHistory => {
            const currentTopicIdeas = prevHistory[activeTopic] || [];
            const newTopicIdeas = currentTopicIdeas.map(idea =>
                idea.nomor === ideaId ? { ...idea, narasi: narrationText, timeline: newTimeline } : idea
            );
            return {
                ...prevHistory,
                [activeTopic]: newTopicIdeas
            };
        });

    } catch (err: any) {
        setTimelineError(err.message || "Gagal membuat timeline adegan lengkap.");
        // We don't clear the timeline here, let the user see the old state if any
    } finally {
        setIsGeneratingTimeline(false);
    }
  }, [videoDuration, activeTopic]);

  const handleCreateStoryAndTimeline = (idea: ViralIdea) => {
    const wordCountMin = Math.round(videoDuration * 3.5);
    const wordCountMax = Math.round(videoDuration * 4.2);

    const storyPrompt = `Buatkan saya cerita pendek dari tema: "${idea.judul} - ${idea.deskripsi}". Cerita harus maksimal ${wordCountMin}–${wordCountMax} kata, intens, bikin nagih, dan penuh emosi seperti karya manusia yang cocok untuk video pendek, konten storytelling, atau narasi dramatis berdurasi maksimal ${videoDuration} detik dengan struktur format: HOOK (Kalimat pertama – maksimal 2 kalimat) Buat pembuka yang nge-hook, bisa berupa pertanyaan mencurigakan, pernyataan aneh, atau situasi ekstrem. KONFLIK (isi tengah) Bangun ketegangan secara bertahap. Fokus pada emosi, tindakan dan dilema. Buat pembaca merasa seperti didalam cerita. Gunakan kalimat pendek dan ritme yang cepat jika ingin membangun intensitas. TWIST Ubah arah cerita dengan cara tak terduga. Hindari ending klise. Lebih baik jika pembaca harus membacanya dua kali untuk benar-benar paham. CTA (Call to Action & Pertanyaan Interaktif - 1 kalimat di akhir) Ajak penonton untuk berinteraksi. Ini penting untuk meningkatkan engagement. Buat pertanyaan singkat yang memancing diskusi atau komentar terkait cerita. Contoh: "Gimana menurutmu, apakah Edith pantas jadi pahlawan?" atau "Kira-kira cerita apalagi yang bikin kamu penasaran? Coba komen di bawah!". SUARA PENULIS/NUANSA (optional) Tambahkan gaya bahasa unik, nyeleneh atau puitis untuk memberi “rasa manusia”. Aturan tambahan: Gunakan bahasa Indonesia yang hidup dan santai. Hindari terlalu baku. Cerita harus punya ketegangan emosional tinggi (tekanan batin, rahasia besar, pertaruhan hidup mati, dll). Gunakan format 3 paragraf atau maksimal 6 baris.`;
    
    setPrompt(storyPrompt);
    narrationSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    generateFullTimeline(storyPrompt, idea.nomor);
  };
  
  const handleShowResults = (idea: ViralIdea) => {
    setActiveIdeaId(idea.nomor);
    const storyPrompt = idea.narasi || ''; // Ideally reconstruct from narasi or store it
    setPrompt(storyPrompt);
    narrationSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectTopicFromHistory = (topic: string) => {
    setViralTopic(topic);
    setActiveTopic(topic);
    setActiveIdeaId(null);
    setIsHistoryOpen(false);
  };

  const updateTimelineItem = (index: number, updates: Partial<TimelineItemState>) => {
    if (!activeIdeaId || !activeTopic) return;
    setIdeaHistory(prevHistory => {
        const currentTopicIdeas = prevHistory[activeTopic] || [];
        const newTopicIdeas = currentTopicIdeas.map(idea => {
            if (idea.nomor !== activeIdeaId) return idea;
            const newTimeline = [...(idea.timeline || [])];
            newTimeline[index] = { ...newTimeline[index], ...updates };
            return { ...idea, timeline: newTimeline };
        });
        return {
            ...prevHistory,
            [activeTopic]: newTopicIdeas,
        };
    });
  };

  const processImageGenerationQueue = async (indicesToProcess: number[]) => {
    setTimelineError('');

    if (dailyQuotaError) {
        setTimelineError(dailyQuotaError);
        return;
    }

    // Rate limit check
    const now = Date.now();
    const recentTimestamps = requestTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW);

    if (recentTimestamps.length + indicesToProcess.length > RATE_LIMIT) {
        const oldestRequest = recentTimestamps[0] || now;
        const timeToWait = Math.ceil((RATE_LIMIT_WINDOW - (now - oldestRequest)) / 1000);
        setRateLimitError(`Batas kuota tercapai. Silakan tunggu ${timeToWait} detik.`);
        setCountdown(timeToWait);
        setRequestTimestamps(recentTimestamps);
        return;
    }

    const newTimestamps = [...recentTimestamps, ...Array(indicesToProcess.length).fill(Date.now())];
    setRequestTimestamps(newTimestamps);
    
    const batchPromises = indicesToProcess.map(async (index) => {
      const scene = activeTimeline[index];
      if (!scene || scene.isGenerating || scene.imageUrl) return;

      updateTimelineItem(index, { isGenerating: true, generationError: null });

      try {
        const imageUrl = await generateImage(scene.promptGambar, '9:16');
        updateTimelineItem(index, { imageUrl, isGenerating: false });
      } catch (error: any) {
        const errorMessage = error.message || 'Gagal';
        console.error(`Gagal membuat gambar untuk: "${scene.promptGambar}"`, error);

        if (errorMessage.toLowerCase().includes("quota exceeded") && errorMessage.toLowerCase().includes("per day")) {
            const specificError = "Batas kuota harian tercapai. Silakan coba lagi besok.";
            if (!dailyQuotaError) { // Set only once
                setDailyQuotaError(specificError);
                setTimelineError(specificError);
            }
        }
        
        updateTimelineItem(index, { isGenerating: false, generationError: 'Gagal' });
      }
    });
    
    await Promise.all(batchPromises);
  };

  const handleGenerateSingleImage = (index: number) => {
    processImageGenerationQueue([index]);
  };

  const handleGenerateAllImages = () => {
    const indicesToGenerate = activeTimeline
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => !scene.imageUrl && !scene.isGenerating)
      .map(({ index }) => index);
    
    if (indicesToGenerate.length === 0) return;
    processImageGenerationQueue(indicesToGenerate);
  };

  const handleRetryFailedImages = () => {
    const indicesToRetry = activeTimeline
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !!item.generationError && !item.imageUrl)
      .map(({ index }) => index);
      
    if (indicesToRetry.length === 0) return;
    processImageGenerationQueue(indicesToRetry);
  };

  const handleDownloadJson = useCallback(() => {
    if (activeTimeline.length === 0) return;
    const dataToDownload = activeTimeline.map(({ isGenerating, generationError, imageUrl, ...rest }) => rest);
    const dataStr = JSON.stringify(dataToDownload, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'timeline_adegan.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [activeTimeline]);

  const handleDownloadImages = useCallback(async () => {
    const imagesToDownload = activeTimeline.filter(item => item.imageUrl);
    if (imagesToDownload.length === 0) return;
    setIsZipping(true);
    try {
        const zip = new JSZip();
        const imageFetchPromises = imagesToDownload.map(async (item) => {
            const response = await fetch(item.imageUrl!);
            const blob = await response.blob();
            const filename = `${sanitizeTimelineToFilename(item.timeline)}.png`;
            zip.file(filename, blob);
        });
        await Promise.all(imageFetchPromises);
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const linkElement = document.createElement('a');
        linkElement.href = URL.createObjectURL(zipBlob);
        linkElement.download = 'timeline_images.zip';
        document.body.appendChild(linkElement);
        linkElement.click();
        document.body.removeChild(linkElement);
        URL.revokeObjectURL(linkElement.href);
    } catch (error) {
        console.error("Gagal membuat file zip:", error);
        setTimelineError("Gagal membuat file zip. Lihat konsol untuk detail.");
    } finally {
        setIsZipping(false);
    }
  }, [activeTimeline]);

 const handleSendToVideo = useCallback(() => {
    if (!allImagesGenerated) return;
    const imagesData: ImageForVideo[] = activeTimeline
      .filter(item => !!item.imageUrl)
      .map(item => ({
        imageUrl: item.imageUrl!,
        promptVideo: item.promptVideo,
        adegan: item.adegan,
        timeline: item.timeline,
      }));
    setImagesForVideo(imagesData);
    setActiveTab('video');
  }, [activeTimeline, allImagesGenerated, setImagesForVideo, setActiveTab]);
  
  const currentRequestCount = requestTimestamps.filter(ts => Date.now() - ts < RATE_LIMIT_WINDOW).length;

  return (
    <>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-40 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-8 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-bold text-white mb-6">Konfigurasi Generator</h3>
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="num-ideas" className="text-sm font-medium text-gray-300">Jumlah Ide Konten</label>
                    <input
                      type="number"
                      id="num-ideas"
                      value={numberOfIdeas}
                      onChange={(e) => setNumberOfIdeas(parseInt(e.target.value, 10) || 1)}
                      min="1"
                      max="50"
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-colors duration-200 text-gray-200"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="duration" className="text-sm font-medium text-gray-300">Target Durasi Video (detik)</label>
                    <input
                      type="number"
                      id="duration"
                      value={videoDuration}
                      onChange={(e) => setVideoDuration(parseInt(e.target.value, 10) || 1)}
                       min="1"
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-colors duration-200 text-gray-200"
                    />
                  </div>
              </div>
              <hr className="border-gray-700"/>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <label htmlFor="idea-prompt-template" className="text-sm font-medium text-gray-300">Template Prompt Ide</label>
                    <button
                        onClick={() => setIdeaPromptTemplate(DEFAULT_IDEA_PROMPT_TEMPLATE)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-semibold"
                    >
                        Reset ke Default
                    </button>
                </div>
                <textarea
                    id="idea-prompt-template"
                    value={ideaPromptTemplate}
                    onChange={(e) => setIdeaPromptTemplate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-colors duration-200 text-gray-200 min-h-[160px] font-mono text-sm"
                    rows={8}
                />
                <p className="text-xs text-gray-500 mt-1">
                    Variabel yang tersedia: <code className="bg-gray-700 text-cyan-400 px-1 rounded">{'{numberOfIdeas}'}</code>, <code className="bg-gray-700 text-cyan-400 px-1 rounded">{'{videoDuration}'}</code>, <code className="bg-gray-700 text-cyan-400 px-1 rounded">{'{viralTopic}'}</code>
                </p>
               </div>
            </div>
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-cyan-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-cyan-700 transition-colors duration-200"
              >
                Simpan & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex flex-col h-full">
        {/* Viral Idea Generator */}
        <div className="mb-10">
          <div className="p-1 bg-gradient-to-r from-green-400 to-cyan-500 rounded-xl shadow-lg">
              <div className="bg-gray-950 p-6 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">Generator Ide Konten Viral</h2>
                    <p className="text-gray-400">Temukan ide judul & tema untuk video pendek berdasarkan topik pilihan Anda.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsModalOpen(true)}
                      className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors duration-200"
                      title="Konfigurasi"
                    >
                        <CogIcon />
                    </button>
                  </div>
                </div>
              </div>
          </div>
          <div className="flex flex-col gap-6 mt-8">
            <div className="flex flex-col gap-2">
                <label htmlFor="viral-topic" className="text-sm font-medium text-gray-300">Masukkan Topik Utama</label>
                <input
                    type="text"
                    id="viral-topic"
                    value={viralTopic}
                    onChange={(e) => setViralTopic(e.target.value)}
                    placeholder="Contoh: sejarah, sains, teknologi, memasak"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-colors duration-200 text-gray-200"
                    disabled={isGeneratingIdeas || isGeneratingMoreIdeas}
                />
            </div>
            
            {ideaError && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{ideaError}</p>}

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button
                onClick={handleGenerateIdeas}
                disabled={isGeneratingIdeas || !viralTopic.trim() || isGeneratingMoreIdeas}
                className="w-full sm:w-auto flex-grow flex items-center justify-center gap-2 bg-cyan-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-cyan-700 disabled:bg-cyan-900 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                {isGeneratingIdeas ? <><Spinner size="5" color="white" /> Generating...</> : <><SparklesIcon /> Generate Ide</>}
              </button>
               <div className="relative" ref={historyRef}>
                  <button 
                      onClick={() => setIsHistoryOpen(prev => !prev)}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors duration-200"
                      title="Riwayat Generate Ide"
                  >
                      <HistoryIcon />
                      <span>Riwayat</span>
                  </button>
                  {isHistoryOpen && (
                      <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20">
                          <div className="p-2">
                              <h4 className="font-semibold text-sm text-gray-300 px-2 pb-1 border-b border-gray-700 mb-1">Riwayat Topik</h4>
                              {Object.keys(ideaHistory).length > 0 ? (
                                  <ul className="max-h-60 overflow-y-auto">
                                      {Object.keys(ideaHistory).map(topic => (
                                          <li key={topic}>
                                              <button 
                                                  onClick={() => handleSelectTopicFromHistory(topic)}
                                                  className="w-full text-left px-2 py-1.5 text-sm text-gray-200 rounded hover:bg-gray-700 transition-colors"
                                              >
                                                  {topic}
                                              </button>
                                          </li>
                                      ))}
                                  </ul>
                              ) : (
                                  <p className="text-xs text-gray-500 px-2 py-2">Belum ada riwayat.</p>
                              )}
                          </div>
                      </div>
                  )}
              </div>
            </div>

            {(isGeneratingIdeas && viralIdeas.length === 0) && (
                <div className="text-center py-10">
                    <Spinner size="12" color="cyan-500" />
                    <p className="mt-4 text-gray-400">Mencari ide-ide brilian...</p>
                </div>
            )}

            {viralIdeas.length > 0 && (
              <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-left table-auto">
                      <thead className="bg-gray-700">
                        <tr>
                          <th className="p-4 w-16 text-sm font-semibold text-gray-300">No.</th>
                          <th className="p-4 text-sm font-semibold text-gray-300 min-w-[200px]">Judul</th>
                          <th className="p-4 text-sm font-semibold text-gray-300 min-w-[300px]">Deskripsi Singkat</th>
                          <th className="p-4 text-sm font-semibold text-gray-300">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viralIdeas.map((idea, index) => (
                          <tr key={`${idea.judul}-${index}`} className="border-t border-gray-700 hover:bg-gray-900/50 transition-colors">
                            <td className="p-4 align-top text-gray-400 font-medium">{idea.nomor}</td>
                            <td className="p-4 align-top text-white font-semibold">{idea.judul}</td>
                            <td className="p-4 align-top text-gray-300 text-sm">{idea.deskripsi}</td>
                            <td className="p-4 align-top">
                               {idea.timeline && idea.timeline.length > 0 ? (
                                 <button
                                    onClick={() => handleShowResults(idea)}
                                    className="bg-gray-600 text-white text-xs font-bold py-1.5 px-3 rounded-md hover:bg-gray-700 transition-colors duration-200"
                                    title={`Lihat hasil untuk: ${idea.judul}`}
                                  >
                                    Lihat Hasil
                                  </button>
                               ) : (
                                  <button
                                    onClick={() => handleCreateStoryAndTimeline(idea)}
                                    disabled={isGeneratingTimeline}
                                    className="bg-teal-600 text-white text-xs font-bold py-1.5 px-3 rounded-md hover:bg-teal-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-teal-500 disabled:bg-teal-800 disabled:cursor-not-allowed"
                                    title={`Buat cerita untuk: ${idea.judul}`}
                                  >
                                    Buat Cerita
                                  </button>
                               )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
                <div className="p-4 text-center border-t border-gray-700">
                    <button
                      onClick={handleGenerateMoreIdeas}
                      disabled={isGeneratingMoreIdeas || isGeneratingIdeas}
                      className="inline-flex items-center justify-center gap-2 bg-cyan-700 text-white font-semibold py-2 px-5 rounded-lg hover:bg-cyan-800 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                    >
                        {isGeneratingMoreIdeas ? <><Spinner size="4" color="white" /> Generating...</> : <><SparklesIcon /> Generate 10 More</>}
                    </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <hr className="border-t-2 border-dashed border-gray-700 my-4" />

        {/* Narration Generator */}
        <div className="mt-10" ref={narrationSectionRef}>
          <div className="p-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
              <div className="bg-gray-950 p-6 rounded-lg">
                <h2 className="text-3xl font-bold text-white mb-2">Generate Narasi & Timeline</h2>
                {activeIdea ? (
                     <p className="text-gray-300">Menampilkan hasil untuk: <span className="font-semibold text-purple-300">{activeIdea.judul}</span></p>
                ) : (
                     <p className="text-gray-400">Pilih "Buat Cerita" dari ide di atas untuk memulai.</p>
                )}
              </div>
          </div>
          {(isGeneratingTimeline || activeTimeline.length > 0) && (
          <div className="flex-grow flex flex-col gap-6 mt-8">
            {isGeneratingTimeline && (
                <div className="text-center py-10">
                    <Spinner size="12" color="indigo-500" />
                    <p className="mt-4 text-gray-400">Membuat narasi dan timeline adegan... Proses ini mungkin memakan waktu.</p>
                </div>
            )}
            
            {timelineError && <p className="mt-4 text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{timelineError}</p>}

            {activeTimeline.length > 0 && (
                <div className="mt-8">
                    <div className="flex flex-col gap-4 mb-4">
                        <div className="flex flex-wrap justify-between items-start gap-4">
                            <h3 className="text-2xl font-bold text-white">Timeline Adegan & Aset Visual</h3>
                             <div className="flex items-center flex-wrap gap-3">
                                {hasFailedGenerations && (
                                    <button
                                        onClick={handleRetryFailedImages}
                                        disabled={isAnyImageGenerating || countdown > 0 || !!dailyQuotaError}
                                        className="flex items-center gap-2 bg-yellow-600 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-yellow-700 disabled:bg-yellow-800 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <SparklesIcon />
                                        Coba Ulang Gagal
                                    </button>
                                )}
                                <button
                                    onClick={handleGenerateAllImages}
                                    disabled={isAnyImageGenerating || countdown > 0 || activeTimeline.every(item => !!item.imageUrl) || !!dailyQuotaError}
                                    className="flex items-center gap-2 bg-cyan-600 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-cyan-700 disabled:bg-cyan-800 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                                >
                                    <SparklesIcon />
                                    Generate Semua Gambar
                                </button>
                                <button
                                    onClick={handleSendToVideo}
                                    disabled={!allImagesGenerated || isAnyImageGenerating}
                                    className="flex items-center gap-2 bg-purple-600 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed transition-colors"
                                    title="Kirim semua gambar & prompt ke Video Generator"
                                >
                                    <SendIcon />
                                    Kirim ke Video
                                </button>
                                <button
                                    onClick={handleDownloadJson}
                                    disabled={activeTimeline.length === 0}
                                    className="flex items-center gap-2 bg-gray-600 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed transition-colors"
                                >
                                    <DownloadIcon />
                                    Download JSON
                                </button>
                                 <button 
                                    onClick={handleDownloadImages}
                                    disabled={isZipping || activeTimeline.every(item => !item.imageUrl)}
                                    className="flex items-center gap-2 bg-green-600 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-800 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isZipping ? <Spinner size="4" color="white" /> : <DownloadIcon />}
                                    {isZipping ? 'Zipping...' : 'Unduh Gambar'}
                                </button>
                            </div>
                        </div>
                        <div className="w-full bg-gray-800 border border-gray-700 p-3 rounded-lg flex items-center justify-between text-sm">
                             {dailyQuotaError ? (
                                <div className="text-red-400 w-full text-center font-semibold">
                                    {dailyQuotaError}
                                </div>
                            ) : (
                                <>
                                    <div className="text-gray-300">
                                        Kuota Generate Gambar (per menit): <span className="font-bold text-white">{currentRequestCount} / {RATE_LIMIT}</span>
                                    </div>
                                    {countdown > 0 && (
                                        <div className="text-yellow-400">
                                            Batas tercapai. Coba lagi dalam: <span className="font-bold text-white">{countdown} detik</span>
                                        </div>
                                    )}
                                    {rateLimitError && !countdown && <p className="text-red-400">{rateLimitError}</p>}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-x-auto">
                        <table className="w-full text-left table-auto">
                            <thead className="bg-gray-700">
                                <tr>
                                    <th className="p-4 text-sm font-semibold text-gray-300 min-w-[120px]">Timeline</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 min-w-[150px]">Adegan</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 min-w-[250px]">Narasi Adegan</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 min-w-[250px]">Prompt Gambar</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 min-w-[200px]">Prompt Video</th>
                                    <th className="p-4 text-sm font-semibold text-gray-300 min-w-[140px]">Gambar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeTimeline.map((item, index) => (
                                    <tr key={index} className="border-t border-gray-700 hover:bg-gray-900/50 transition-colors">
                                        <td className="p-4 align-top text-gray-300 font-medium text-sm whitespace-nowrap">
                                            <span>{item.timeline}</span>
                                            {parseTimelineDuration(item.timeline) !== null && (
                                                <span className="block text-xs text-gray-400 mt-1">
                                                    {parseTimelineDuration(item.timeline)} detik
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 align-top text-white font-semibold text-sm">{item.adegan}</td>
                                        <td className="p-4 align-top text-gray-300 text-sm">{item.narasiAdegan}</td>
                                        <td className="p-4 align-top text-cyan-300 text-sm font-mono">{item.promptGambar}</td>
                                        <td className="p-4 align-top text-amber-300 text-sm font-mono">{item.promptVideo}</td>
                                        <td className="p-2 align-middle">
                                            <div className="w-24 h-40 flex flex-col items-center justify-center rounded-md">
                                                {item.isGenerating ? (
                                                    <Spinner size="8" />
                                                ) : item.imageUrl ? (
                                                    <img src={item.imageUrl} alt={item.adegan} className="w-full h-full object-contain rounded-md bg-gray-900"/>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center p-2 text-center w-full">
                                                        <button
                                                            onClick={() => handleGenerateSingleImage(index)}
                                                            disabled={isAnyImageGenerating || countdown > 0 || !!dailyQuotaError}
                                                            className="bg-cyan-600 text-white text-xs font-bold py-1.5 px-3 rounded-md hover:bg-cyan-700 disabled:bg-cyan-800 disabled:cursor-not-allowed transition-colors duration-200"
                                                        >
                                                            {item.generationError ? 'Coba Lagi' : 'Generate'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
          </div>
          )}
        </div>
      </div>
    </>
  );
};

export default NarrationGenerator;