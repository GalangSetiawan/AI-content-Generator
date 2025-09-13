
import React, { useState, useCallback } from 'react';
import type { GeneratedImage } from '../types';
import { generateImage } from '../services/geminiService';
import Spinner from './Spinner';
import { SparklesIcon } from './icons/SparklesIcon';

const BatchImageGenerator: React.FC = () => {
  const [prompts, setPrompts] = useState<string>('');
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleGenerate = useCallback(async () => {
    const promptList = prompts.split('\n').filter(p => p.trim() !== '');
    if (promptList.length === 0) {
      setError('Masukkan setidaknya satu prompt.');
      return;
    }

    setIsLoading(true);
    setError('');
    setImages([]);

    const imagePromises = promptList.map(async (prompt) => {
      try {
        const imageUrl = await generateImage(prompt);
        return { prompt, imageUrl };
      } catch (err) {
        return { prompt, imageUrl: '', error: `Gagal membuat gambar untuk: "${prompt}"` };
      }
    });

    const results = await Promise.all(imagePromises);
    setImages(results);
    setIsLoading(false);
  }, [prompts]);

  return (
    <div className="max-w-6xl mx-auto">
        <div className="p-1 bg-gradient-to-r from-blue-500 to-teal-500 rounded-xl">
          <div className="bg-gray-950 p-6 rounded-lg">
             <h2 className="text-3xl font-bold text-white mb-2">Batch Image Generator</h2>
             <p className="text-gray-400">Masukkan beberapa prompt (satu per baris) untuk membuat banyak gambar sekaligus.</p>
          </div>
        </div>
      
      <div className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="prompts" className="text-sm font-medium text-gray-300">Daftar Prompt (satu per baris)</label>
          <textarea
            id="prompts"
            value={prompts}
            onChange={(e) => setPrompts(e.target.value)}
            placeholder="seekor kucing astronot di bulan&#10;sebuah kota futuristik di malam hari&#10;hutan ajaib dengan jamur bercahaya"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors duration-200 text-gray-200 min-h-[150px]"
            rows={6}
            disabled={isLoading}
          />
        </div>
        
        {error && <p className="text-red-400 bg-red-900/50 border border-red-500/50 p-3 rounded-lg text-sm">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
        >
          {isLoading ? <><Spinner size="5" color="white" /> Generating...</> : <><SparklesIcon /> Generate Gambar</>}
        </button>

        {isLoading && (
            <div className="text-center py-10">
                <Spinner size="12" color="blue-500" />
                <p className="mt-4 text-gray-400">Membuat gambar, harap tunggu...</p>
            </div>
        )}
        
        {images.length > 0 && !isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {images.map((img, index) => (
              <div key={index} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg transform transition-transform hover:scale-105 duration-300">
                {img.imageUrl ? (
                  <img src={img.imageUrl} alt={img.prompt} className="w-full h-48 object-cover" />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center bg-gray-700 text-red-400 p-4 text-center text-xs">
                    {img.error}
                  </div>
                )}
                <div className="p-4">
                  <p className="text-gray-300 text-sm truncate">{img.prompt}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchImageGenerator;
