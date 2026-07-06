export {};

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    luna: {
      health: () => Promise<any>;
      resetDemo: () => Promise<any>;
      chat: (messages: any[]) => Promise<any>;
      transcribeAudio: (samples: Float32Array | number[]) => Promise<{ text: string }>;
      voiceStatus: () => Promise<{ ready: boolean; cacheDir: string; downloaded: boolean }>;
      runJobMission: () => Promise<any>;
      planCleanup: () => Promise<any>;
      executeCleanup: (plan: any) => Promise<any>;
      undoMission: (missionId: string) => Promise<any>;
      revealPath: (path: string) => Promise<any>;
      getNetworkLog: () => Promise<any>;
      getResources: () => Promise<any>;
      generateSkill: (description: string) => Promise<any>;
      saveSkill: (skill: any) => Promise<any>;
      listSkills: () => Promise<any>;
      runSkill: (skillId: string) => Promise<any>;
      vaultIndexDemo: () => Promise<any>;
      vaultImportFiles: () => Promise<any>;
      vaultState: () => Promise<any>;
      vaultSearch: (query: string) => Promise<any>;
      vaultAsk: (question: string) => Promise<any>;
      memoryList: () => Promise<any>;
      memoryAdd: (text: string, type?: string, source?: string) => Promise<any>;
      memorySearch: (query: string) => Promise<any>;
      memoryDelete: (id: string) => Promise<any>;
      memorySeed: () => Promise<any>;
      contextBuild: (query: string) => Promise<any>;
      chatPlus: (messages: any[]) => Promise<any>;
      runResearchMission: () => Promise<any>;
      runMissionTemplate: (missionId: string) => Promise<any>;
      modelRecommend: () => Promise<any>;
      modelBenchmark: () => Promise<any>;
      fallbackDrill: () => Promise<any>;
      lensContext: () => Promise<any>;
      lensImportImage: () => Promise<any>;
      lensExplain: (snapshot: any) => Promise<any>;
      routeCommand: (command: string) => Promise<any>;
      openMainCommandPalette: () => Promise<any>;
      auditList: () => Promise<any>;
      trustExport: () => Promise<any>;
      dataResetAll: () => Promise<any>;
      attachmentsImport: () => Promise<any>;
      attachmentsList: () => Promise<any>;
      attachmentsClear: () => Promise<any>;
      attachmentsToVault: () => Promise<any>;
      attachmentsSummarize: () => Promise<any>;
      settingsGet: () => Promise<any>;
      settingsSave: (settings: any) => Promise<any>;
      databaseStatus: () => Promise<any>;
      onCommandPalette: (callback: () => void) => () => void;
    };
  }
}