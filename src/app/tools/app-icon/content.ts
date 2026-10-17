/** Explanation and FAQ text for the App Icon Generator. */
import { ToolContent } from '../../shared/tool-info/tool-info';

export const APP_ICON_CONTENT: ToolContent = {
  aboutHeading: 'About the App Icon Generator',
  about:
    'Make every app icon size from one image. For Android you get the launcher icons for each screen density, round ' +
    'icons, an adaptive icon (foreground image, background colour and the XML files) and the 512 px Play Store icon. ' +
    'For iOS you get an AppIcon.appiconset with its Contents.json, ready to drop into Xcode. The files are laid out ' +
    'like your project folders, and your image never leaves your browser.',
  steps: [
    'Choose a square image, ideally a PNG or SVG of 1024×1024 px or more.',
    'Pick a background colour and the padding, and check the previews.',
    'Choose Android, iOS or both.',
    'Download the ZIP and copy the android and ios folders into your project.',
  ],
  faq: [
    {
      question: 'Where do the Android files go?',
      answer:
        'Copy the folders inside android/app/src/main/res into the same folder of your app, replacing the existing ' +
        'ic_launcher files. Flutter and React Native projects use the same android folder.',
    },
    {
      question: 'How do I add the iOS icons in Xcode?',
      answer:
        'Delete the old AppIcon from Assets.xcassets, then drag the AppIcon.appiconset folder in. Xcode 14 and later ' +
        'need only the 1024 px image; tick "All sizes" for older versions of Xcode.',
    },
    {
      question: 'Why do iOS icons get a background colour?',
      answer:
        'App Store icons must not be transparent, so transparent areas are filled with the background colour. iOS ' +
        'rounds the corners itself, so the image stays square.',
    },
    {
      question: 'What is the adaptive icon?',
      answer:
        'Android 8 and later build the icon from a foreground image and a background, and each phone masks it to its ' +
        'own shape. Keep the important part of your logo in the middle: only the centre two thirds always shows.',
    },
  ],
};
