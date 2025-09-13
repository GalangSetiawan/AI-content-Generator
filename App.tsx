
import React, { useState } from 'react';
import type { Tab, ImageForVideo } from './types';
import TabButton from './components/TabButton';
import NarrationGenerator from './components/NarrationGenerator';
import BatchImageGenerator from './components/BatchImageGenerator';
import ImageToVideoGenerator from './components/ImageToVideoGenerator';
import { TextIcon } from './components/icons/TextIcon';
import { ImageIcon } from './components/icons/ImageIcon';
import { VideoIcon } from './components/icons/VideoIcon';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('narasi');
  const [imagesForVideo, setImagesForVideo] = useState<ImageForVideo[]>([]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-64 bg-gray-950 p-4 md:p-6 flex flex-col border-b md:border-b-0 md:border-r border-gray-800">
        <header className="mb-8 flex items-center gap-3">
            <div className="bg-purple-600 p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>
            </div>
            <h1 className="text-xl font-bold text-white">Content Studio</h1>
        </header>
        <nav className="flex md:flex-col gap-2">
          <TabButton
            label="Generate Narasi"
            icon={<TextIcon />}
            isActive={activeTab === 'narasi'}
            onClick={() => setActiveTab('narasi')}
          />
          <TabButton
            label="Generate Gambar"
            icon={<ImageIcon />}
            isActive={activeTab === 'gambar'}
            onClick={() => setActiveTab('gambar')}
          />
          <TabButton
            label="Image to Video"
            icon={<VideoIcon />}
            isActive={activeTab === 'video'}
            onClick={() => setActiveTab('video')}
          />
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div style={{ display: activeTab === 'narasi' ? 'block' : 'none' }}>
          <NarrationGenerator setImagesForVideo={setImagesForVideo} setActiveTab={setActiveTab} />
        </div>
        <div style={{ display: activeTab === 'gambar' ? 'block' : 'none' }}>
          <BatchImageGenerator />
        </div>
        <div style={{ display: activeTab === 'video' ? 'block' : 'none' }}>
          <ImageToVideoGenerator imagesForVideo={imagesForVideo} setImagesForVideo={setImagesForVideo} />
        </div>
      </main>
    </div>
  );
};

export default App;