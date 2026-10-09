// Dynamic UI messages (static page text lives directly in index.html / play.html).

export const STRINGS = {
  landing: {
    hintIOS: 'Toque em “Ver no meu espaço”. O iPhone abre o AR e você pode posicionar o Yungu no chão ou na mesa.',
    hintAndroidAR: 'Toque em “Ver no meu espaço” para posicionar o Yungu, ou em “Jogar” para controlá-lo com joystick.',
    hintAndroidNoXR: 'Toque em “Ver no meu espaço” para abrir o Yungu em realidade aumentada.',
    hintDesktop: 'Abra esta página no celular para ver o Yungu no seu espaço.',
    playAR: 'Jogar com joystick',
    play3D: 'Jogar em 3D',
    playCam: 'Jogar com a câmera',
    playCamNote: 'Neste aparelho o Yungu aparece sobre a imagem da câmera, sem detectar o chão. AR completo: Android (Chrome).',
    arFailed: 'Não foi possível abrir a realidade aumentada neste aparelho. Tente pelo Chrome (Android) ou Safari (iPhone).',
    loading: 'Carregando o Yungu…',
  },
  play: {
    startAR: 'Começar em AR',
    start3D: 'Começar em 3D',
    scanFloor: 'Mova o celular devagar, apontando para o chão…',
    placed: 'Use o joystick para mover o Yungu',
    relocate: 'Yungu voltou! Toque no chão ou numa mesa para mudar o lugar',
    previewHelp: 'Use o joystick (ou WASD / setas / controle) para mover o Yungu',
    arUnsupported: 'Este aparelho não abre AR com joystick. Abrindo em 3D.',
    arError: 'A sessão de AR não pôde ser iniciada.',
    startCam: 'Começar com a câmera',
    camNote: 'Neste aparelho o Yungu aparece sobre a imagem da câmera. Fique no lugar e gire o celular para olhar em volta.',
    camHelp: 'Aponte para o chão e use o joystick para mover o Yungu',
    camError: 'Não foi possível abrir a câmera. Abrindo em 3D.',
    loading: 'Carregando o Yungu…',
  },
};
