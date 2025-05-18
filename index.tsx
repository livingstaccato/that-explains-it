// --- START OF UPDATED FILE index.tsx ---

import {GoogleGenAI} from '@google/genai';
import {marked} from 'marked';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import PptxGenJS from 'pptxgenjs'; // Import pptxgenjs
// JSZip could be added here if needed for zipping PNGs later
// import JSZip from 'jszip';

// --- Configuration ---
const apiKey = process.env.API_KEY || "YOUR_API_KEY"; // Replace if needed
if (apiKey === "YOUR_API_KEY") {
    console.warn("API Key not configured. Please set process.env.API_KEY or replace the placeholder.");
}
const ai = new GoogleGenAI({apiKey});

// --- Presets Data ---
const presets = {
    custom: { metaphor: '', style: '' }, // Placeholder for custom
    cats_simple: { metaphor: 'lots of tiny cats', style: 'a cute, minimal illustration with black ink on white background' },
    robots_tech: { metaphor: 'helpful robots assembling something', style: 'a clean technical blueprint diagram with minimal color accents' },
    forest_whimsy: { metaphor: 'magical forest creatures working together', style: 'a whimsical storybook illustration with soft lines and pastel colors' },
    playdough_eli5: { metaphor: 'someone shaping playdough figures', style: 'a simple, colorful illustration resembling playdough models' }
};

// --- DOM References ---
const userInput = document.querySelector('#input') as HTMLTextAreaElement;
const metaphorSubjectInput = document.querySelector('#metaphorSubject') as HTMLInputElement;
const illustrationStyleInput = document.querySelector('#illustrationStyle') as HTMLTextAreaElement;
const presetSelector = document.querySelector('#presetSelector') as HTMLSelectElement;
const depthControl = document.querySelector('#depthControl') as HTMLSelectElement;
const modelOutput = document.querySelector('#output') as HTMLDivElement;
const error = document.querySelector('#error') as HTMLDivElement;
const exportControls = document.querySelector('#exportControls') as HTMLDivElement;
const savePdfButton = document.querySelector('#savePdfButton') as HTMLButtonElement;
const savePngButton = document.querySelector('#savePngButton') as HTMLButtonElement;
const savePptxButton = document.querySelector('#savePptxButton') as HTMLButtonElement;

// --- Global State ---
let originalUserPrompt = ''; // Store the original prompt for exports

// --- AI Chat Initialization ---
const chat = ai.chats.create({
  model: 'gemini-2.0-flash-exp',
  config: {
    responseModalities: ['TEXT', 'IMAGE'],
  },
  history: [],
});

// --- Core Functions ---

async function addExplanationItem(text: string, image: HTMLImageElement) {
  const itemContainer = document.createElement('div');
  itemContainer.className = 'explanation-item';

  const caption = document.createElement('div') as HTMLDivElement;
  // Use DOMPurify here in a real app if marked output isn't guaranteed safe
  caption.innerHTML = await marked.parse(text);

  await new Promise(resolve => {
      if (image.complete) resolve(true);
      else {
          image.onload = () => resolve(true);
          image.onerror = () => {
              console.error("Image failed to load:", image.src);
              resolve(false); // Resolve even on error to not block indefinitely
          }
      }
  });

  itemContainer.append(image);
  itemContainer.append(caption);
  modelOutput.append(itemContainer);
}

function parseError(error: any): string {
    // Simplified error parsing
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try { return JSON.stringify(error); } catch { return 'An unknown error occurred.'; }
}

function setExportButtonsState(enabled: boolean, message?: string) {
    const buttons = [savePdfButton, savePngButton, savePptxButton];
    buttons.forEach(btn => {
        btn.disabled = !enabled;
        if (message !== undefined) { // If message is provided, update text
             // Reset to default text if enabling, otherwise show message
             if (enabled) {
                 if (btn.id === 'savePdfButton') btn.textContent = "Save as PDF";
                 else if (btn.id === 'savePngButton') btn.textContent = "Save as PNGs";
                 else if (btn.id === 'savePptxButton') btn.textContent = "Save as PPTX";
             } else {
                 btn.textContent = message;
             }
        }
    });
    exportControls.hidden = !enabled; // Show/hide the whole container
}

async function generate(message: string) {
  // --- Disable UI ---
  userInput.disabled = true;
  metaphorSubjectInput.disabled = true;
  illustrationStyleInput.disabled = true;
  presetSelector.disabled = true;
  depthControl.disabled = true;
  setExportButtonsState(false); // Hide and disable export buttons

  // --- Reset State ---
  chat.history.length = 0;
  modelOutput.innerHTML = '';
  error.innerHTML = '';
  error.toggleAttribute('hidden', true);
  originalUserPrompt = message; // Store prompt for exports

  let generationSuccess = false;

  // --- Get Config ---
  const metaphor = metaphorSubjectInput.value.trim() || 'lots of tiny cats';
  const style = illustrationStyleInput.value.trim() || 'a cute, minimal illustration with black ink on white background';
  const depth = depthControl.value; // Simple, Detailed, Expert

  const dynamicInstructions = `
Use a fun story about ${metaphor} as a metaphor.
Keep sentences short but conversational, casual, and engaging.
Adjust the explanation depth to be ${depth}.
Generate ${style} for each sentence.
No commentary, just begin your explanation.
Keep going until you're done.`;

  try {
    userInput.value = ''; // Clear input after reading

    const result = await chat.sendMessageStream({
      message: message + dynamicInstructions,
    });

    let text = '';
    let img: HTMLImageElement | null = null;

    // --- Process Stream ---
    for await (const chunk of result) {
       if (!chunk.candidates?.length) continue;
       for (const candidate of chunk.candidates) {
          if (!candidate.content?.parts?.length) continue;
          for (const part of candidate.content.parts) {
             if (part.text) { text += part.text; }
             else if (part.inlineData?.data) {
                 try {
                     img = document.createElement('img');
                     img.src = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                     img.alt = text.substring(0, 80) || `Illustration using ${metaphor}`;
                 } catch (e) { img = null; console.error('Img creation error:', e); }
             }
             // Add item when both text and image are ready
             if (text && img) {
                 await addExplanationItem(text, img);
                 text = ''; img = null; generationSuccess = true;
             }
          }
       }
    }
    // Handle leftovers
    if (text && img) { await addExplanationItem(text, img); generationSuccess = true; }
    else if (img) { await addExplanationItem(" ", img); generationSuccess = true; } // Image without text
    else if (text && modelOutput.children.length > 0) { // Trailing text only if other items exist
        const trailing = document.createElement('div');
        trailing.className = 'explanation-item-text-only';
        trailing.innerHTML = await marked.parse(text);
        modelOutput.append(trailing);
        generationSuccess = true; // Count trailing text as success
    }

  } catch (e: any) {
    console.error("Generation failed:", e);
    error.innerHTML = `Something went wrong: ${parseError(e)}`;
    error.removeAttribute('hidden');
    generationSuccess = false;
  } finally {
    // --- Re-enable UI ---
    userInput.disabled = false;
    metaphorSubjectInput.disabled = false;
    illustrationStyleInput.disabled = false;
    presetSelector.disabled = false;
    depthControl.disabled = false;
    userInput.focus();

    // --- Manage Export Buttons ---
    const hasContent = modelOutput.querySelector('.explanation-item, .explanation-item-text-only');
    if (generationSuccess && hasContent) {
        setExportButtonsState(true); // Enable and show
    } else {
        setExportButtonsState(false); // Keep hidden/disabled
        if (!generationSuccess && error.innerHTML === '') { // Show generic error if needed
            error.innerHTML = "Generation failed or produced no content.";
            error.removeAttribute('hidden');
        }
    }
  }
}

// --- Event Listeners ---

// Preset Selector Change
presetSelector.addEventListener('change', () => {
    const selectedPreset = presetSelector.value as keyof typeof presets;
    if (selectedPreset !== 'custom' && presets[selectedPreset]) {
        metaphorSubjectInput.value = presets[selectedPreset].metaphor;
        illustrationStyleInput.value = presets[selectedPreset].style;
    }
});

// Input Submission (Enter Key)
userInput.addEventListener('keydown', async (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const message = userInput.value.trim();
    if (message) await generate(message);
    else {
        error.innerHTML = "Please enter a topic to explain.";
        error.removeAttribute('hidden');
    }
  }
});

// --- Export Functions ---

// Helper to capture an element as canvas
async function captureElement(element: HTMLElement): Promise<HTMLCanvasElement | null> {
    try {
        // Ensure element is styled appropriately for capture (white bg)
        const originalBg = element.style.backgroundColor;
        element.style.backgroundColor = '#ffffff';

        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff', // Explicit background
            width: element.offsetWidth,
            height: element.offsetHeight,
            scrollX: 0, scrollY: 0,
            windowWidth: element.scrollWidth, windowHeight: element.scrollHeight
        });
        element.style.backgroundColor = originalBg; // Restore original style
        return canvas;
    } catch (err) {
        console.error("html2canvas capture failed:", err);
        error.innerHTML = `Failed to capture element for export: ${parseError(err)}`;
        error.removeAttribute('hidden');
        return null;
    }
}

// Helper to download a data URL
function downloadDataUrl(dataUrl: string, filename: string) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// PDF Export
savePdfButton.addEventListener('click', async () => {
    const itemsToCapture = modelOutput.querySelectorAll('.explanation-item, .explanation-item-text-only');
    if (!itemsToCapture.length) return;

    setExportButtonsState(false, "Generating PDF...");

    try {
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const margin = 15;
        const usableWidth = pdfWidth - (margin * 2);
        const usableHeight = pdfHeight - (margin * 2);

        // --- Create Title Page ---
        const titlePageElement = document.createElement('div');
        // (Styling similar to previous version - kept concise here)
        titlePageElement.style.cssText = `width: ${usableWidth * 2}px; padding: ${margin * 2}px; background-color: #ffffff; font-family: 'Space Mono', monospace; color: #333;`;
        titlePageElement.innerHTML = `
            <h1 style="font-size: 28px; text-align: center; margin-bottom: 30px; color: #000;">Explanation For:</h1>
            <div style="background-color: #f0f0f0; border: 1px solid #ddd; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-size: 16px; line-height: 1.5;">${await marked.parse(originalUserPrompt)}</div>
            <h2 style="font-size: 20px; margin-top: 30px; margin-bottom: 10px; color: #555;">Configuration Used:</h2>
            <p style="font-size: 14px; margin-bottom: 8px;"><strong>Metaphor:</strong> ${metaphorSubjectInput.value || '(default)'}</p>
            <p style="font-size: 14px; margin-bottom: 8px;"><strong>Style:</strong> ${illustrationStyleInput.value || '(default)'}</p>
             <p style="font-size: 14px;"><strong>Depth:</strong> ${depthControl.value}</p>
        `;
        document.body.appendChild(titlePageElement);
        const titleCanvas = await captureElement(titlePageElement);
        document.body.removeChild(titlePageElement);

        if (titleCanvas) {
            const imgData = titleCanvas.toDataURL('image/png');
            const imgProps = pdf.getImageProperties(imgData);
            let w = usableWidth; let h = w / (imgProps.width / imgProps.height);
            if (h > usableHeight) { h = usableHeight; w = h * (imgProps.width / imgProps.height); }
            const x = margin + (usableWidth - w) / 2; const y = margin + (usableHeight - h) / 2;
            pdf.addImage(imgData, 'PNG', x, y, w, h);
        }
        // --- End Title Page ---


        // --- Add Item Pages ---
        for (let i = 0; i < itemsToCapture.length; i++) {
            savePdfButton.textContent = `Generating PDF (Page ${i + 2}/${itemsToCapture.length + 1})...`;
            const element = itemsToCapture[i] as HTMLElement;
            const canvas = await captureElement(element);
            if (canvas) {
                pdf.addPage();
                const imgData = canvas.toDataURL('image/png');
                const imgProps = pdf.getImageProperties(imgData);
                let w = usableWidth; let h = w / (imgProps.width / imgProps.height);
                if (h > usableHeight) { h = usableHeight; w = h * (imgProps.width / imgProps.height); }
                const x = margin + (usableWidth - w) / 2; const y = margin + (usableHeight - h) / 2;
                pdf.addImage(imgData, 'PNG', x, y, w, h);
            }
        }
        pdf.save('explanation.pdf');

    } catch (err) {
        console.error("PDF Generation Error:", err);
        error.innerHTML = `Failed to generate PDF: ${parseError(err)}`;
        error.removeAttribute('hidden');
    } finally {
        setExportButtonsState(true); // Re-enable all buttons
    }
});

// PNG Export
savePngButton.addEventListener('click', async () => {
    const itemsToCapture = modelOutput.querySelectorAll('.explanation-item, .explanation-item-text-only');
    if (!itemsToCapture.length) return;

    setExportButtonsState(false, "Saving PNGs...");
    let success = true;

    try {
        for (let i = 0; i < itemsToCapture.length; i++) {
            savePngButton.textContent = `Saving PNGs (${i + 1}/${itemsToCapture.length})...`;
            const element = itemsToCapture[i] as HTMLElement;
            const canvas = await captureElement(element);
            if (canvas) {
                const dataUrl = canvas.toDataURL('image/png');
                // Pad index for better sorting
                const filename = `explanation_frame_${String(i + 1).padStart(2, '0')}.png`;
                downloadDataUrl(dataUrl, filename);
                // Add a small delay between downloads if needed, browser might block rapid downloads
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                success = false; // Mark as failed if any capture fails
                break; // Stop processing further images on error
            }
        }
    } catch (err) {
         console.error("PNG Generation Error:", err);
         error.innerHTML = `Failed to generate PNGs: ${parseError(err)}`;
         error.removeAttribute('hidden');
         success = false;
    } finally {
         setExportButtonsState(true); // Re-enable all buttons
         if (!success) {
             savePngButton.textContent = "Save as PNGs (Failed)";
         }
    }
});

// PPTX Export
savePptxButton.addEventListener('click', async () => {
    const itemsToCapture = modelOutput.querySelectorAll('.explanation-item, .explanation-item-text-only');
     if (!itemsToCapture.length) return;

    setExportButtonsState(false, "Generating PPTX...");

    try {
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE'; // Use widescreen layout

        // --- Add Title Slide ---
        const titleSlide = pptx.addSlide();
        titleSlide.background = { color: "FFFFFF" }; // White background
        titleSlide.addText("Explanation For:", { x: 0.5, y: 0.5, w: '90%', h: 0.5, fontSize: 28, align: 'center', bold: true });
        // Use addText for better control over prompt formatting in PPTX
        titleSlide.addText(originalUserPrompt, { x: 0.5, y: 1.2, w: '90%', h: 1.5, fontSize: 16, align: 'left', color: '333333', fill: { color: 'F0F0F0' } });
        titleSlide.addText("Configuration:", { x: 0.5, y: 3.0, w: '90%', h: 0.4, fontSize: 20, bold: true, color: '555555'});
        titleSlide.addText(`Metaphor: ${metaphorSubjectInput.value || '(default)'}`, { x: 0.5, y: 3.5, w: '90%', h: 0.3, fontSize: 12});
        titleSlide.addText(`Style: ${illustrationStyleInput.value || '(default)'}`, { x: 0.5, y: 3.9, w: '90%', h: 0.3, fontSize: 12});
        titleSlide.addText(`Depth: ${depthControl.value}`, { x: 0.5, y: 4.3, w: '90%', h: 0.3, fontSize: 12});
        // --- End Title Slide ---

        // --- Add Item Slides ---
        for (let i = 0; i < itemsToCapture.length; i++) {
             savePptxButton.textContent = `Generating PPTX (Slide ${i + 2}/${itemsToCapture.length + 1})...`;
             const element = itemsToCapture[i] as HTMLElement;
             const canvas = await captureElement(element);
             if (canvas) {
                 const slide = pptx.addSlide();
                 slide.background = { color: "FFFFFF" }; // Ensure white background
                 const imgData = canvas.toDataURL('image/png');

                 // Calculate image dimensions to fit slide (maintain aspect ratio)
                 // PPTXGenJS uses inches by default. Slide width ~10in, height ~5.6in for WIDE
                 const slideW = 10; const slideH = 5.6;
                 const margin = 0.5; // 0.5 inch margin
                 const usableW = slideW - (margin * 2); const usableH = slideH - (margin * 2);
                 let w = usableW; let h = w / (canvas.width / canvas.height);
                 if (h > usableH) { h = usableH; w = h * (canvas.width / canvas.height); }
                 const x = margin + (usableW - w) / 2; const y = margin + (usableH - h) / 2;

                 slide.addImage({ data: imgData, x: x, y: y, w: w, h: h });
             }
        }

        await pptx.writeFile({ fileName: 'explanation.pptx' });

    } catch (err) {
        console.error("PPTX Generation Error:", err);
        error.innerHTML = `Failed to generate PPTX: ${parseError(err)}`;
        error.removeAttribute('hidden');
    } finally {
        setExportButtonsState(true); // Re-enable all buttons
    }
});

// --- END OF FILE index.tsx ---