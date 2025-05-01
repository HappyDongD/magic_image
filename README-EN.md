# AI Painting Assistant

<div align="right"><a href="README.md">中文</a> | English</div>

[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.0-38B2AC.svg)](https://tailwindcss.com/)

An AI painting application developed based on Next.js, supporting multiple AI models and providing text-to-image and image-to-image features.

## Online Demo

Visit: [https://image-front-eight.vercel.app/](https://image-front-eight.vercel.app/)

## Features

- 🎨 Multiple AI Models Support
  - GPT Sora_Image Model
  - GPT 4o_Image Model
  - GPT Image 1 Model
  - DALL-E 3 Model
- ✍️ Text-to-Image
  - Custom prompt support
  - Aspect ratio selection
  - Multiple image sizes
- 🖼️ Image-to-Image
  - Image editing
  - Region mask editing
  - Image quality adjustment
- 🔒 Data Security
  - All generated images and history are stored locally in the browser
  - Custom API proxy address support
  - API Key configuration
- 📱 UI Design
  - Modern user interface
  - Smooth interaction experience

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- shadcn/ui
- React

## Local Development

1. Clone the project
```bash
git clone https://github.com/HappyDongD/image_front.git
cd image_front
```

2. Install dependencies
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Start the development server
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

4. Visit [http://localhost:3000](http://localhost:3000)

## Vercel Deployment

1. Fork this project to your GitHub account

2. Create a new project on [Vercel](https://vercel.com)

3. Import your GitHub repository

4. Click Deploy

## Usage Guide

1. First-time setup requires API key configuration
   - Click "API Settings" in the top right corner
   - Enter API key and base URL
   - Click Save

2. Select generation mode
   - Text-to-Image: Generate images from text descriptions
   - Image-to-Image: Upload and edit images

3. Set generation parameters
   - Select AI model
   - Set image aspect ratio
   - Adjust image quality (Image-to-Image mode)

4. Generate images
   - Enter prompts
   - Click "Generate Image" button
   - Wait for generation to complete

5. Image management
   - View history
   - Download generated images
   - Edit existing images

## Notes

- All generated images and history are stored locally in the browser
- Using private mode or changing devices will result in data loss
- Please download and backup important images promptly
- API configuration is securely stored in your browser and will not be uploaded to the server

## Contributing

Welcome to submit Issues and Pull Requests to help improve the project.

## License

MIT License 

---
<div align="center">
  <a href="https://github.com/HappyDongD/image_front" target="_blank" rel="noopener noreferrer">
    Visit GitHub Project Page
  </a>
</div> 