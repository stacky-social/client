declare module 'react-emoji-picker' {
    import * as React from 'react';
  
    export interface EmojiPickerProps {
      onEmojiClick?: (emoji: any, event: MouseEvent) => void;
      preload?: boolean;
      disableSearchBar?: boolean;
      disableSkinTonePicker?: boolean;
    }
  
    export default class EmojiPicker extends React.Component<EmojiPickerProps> {}
  }
  