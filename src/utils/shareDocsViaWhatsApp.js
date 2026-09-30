/**
 * shareDocsViaWhatsApp.js
 *
 * Generates both signed loan documents as PDFs in-browser using html2pdf.js,
 * uploads them to Supabase Storage (`signed-docs` bucket), gets 7-day signed
 * URLs, then opens WhatsApp with a pre-filled message containing both links.
 *
 * Zero manual steps for the loan officer.
 */

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '@/config/supabaseClient';

/**
 * Convert an HTML string to a PDF Blob using html2canvas and jsPDF directly.
 * Completely avoids html2pdf.js overlay bugs where opacity: 0 caused blank white pages.
 *
 * @param {string} rawHtml - Full HTML document string
 * @param {string} filename - Suggested filename
 * @returns {Promise<Blob>} PDF blob
 */
/**
 * html2canvas does not support CSS `filter: saturate(...) contrast(...)`.
 * In browser print preview, CSS filters boost the stamp by 2.5x saturation and 1.8x contrast.
 * To make the stamp deep vibrant blue and red in the generated PDF (matching the print preview),
 * we bake the saturation & contrast into the image pixels via a 2D canvas and remove opacity reduction.
 */
async function boostStampInHtml(html) {
  // Remove the opacity: 0.85 dimming
  let processed = html.replace(/opacity:\s*0\.85/gi, 'opacity: 1');

  // Match the stamp base64 data URL
  const match = processed.match(/src="(data:image\/[^;]+;base64,[^"]+)"\s+alt="Stamp"/);
  if (!match) return processed;

  const rawStamp = match[1];
  try {
    const boosted = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || img.width || 400;
        c.height = img.naturalHeight || img.height || 400;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.filter = 'saturate(2.8) contrast(1.9) brightness(0.95)';
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        } else {
          resolve(rawStamp);
        }
      };
      img.onerror = () => resolve(rawStamp);
      img.src = rawStamp;
    });

    return processed.split(rawStamp).join(boosted);
  } catch (_) {
    return processed;
  }
}

async function htmlToBlob(rawHtml, filename) {
  // Boost stamp saturation/contrast so it is bold, crisp, and vivid
  let cleanHtml = await boostStampInHtml(rawHtml);

  return new Promise((resolve, reject) => {
    // 1. Create an isolated iframe so LMS theme (like [data-theme='green']) cannot leak in
    const iframe = document.createElement('iframe');
    iframe.style.cssText = [
      'position: fixed',
      'left: 0',
      'top: 0',
      'width: 800px',
      'height: 1200px',
      'border: none',
      'z-index: -9999',
      'pointer-events: none',
      'background: #ffffff',
    ].join(';');

    document.body.appendChild(iframe);

    // 1. Replace @import with link tags to ensure Google Fonts load cleanly in iframe
    cleanHtml = cleanHtml.replace(/@import\s+url\([^)]+\);?/gi, '');
    const fontTags = `
      <meta name="viewport" content="width=800, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
      <style>
        body {
          width: 800px !important;
          max-width: 800px !important;
          padding: 0 !important;
          margin: 0 !important;
          background: #ffffff !important;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        .doc-page {
          width: 800px !important;
          max-width: 800px !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          min-height: 1131px !important;
        }
        * {
          letter-spacing: normal !important;
          word-spacing: normal !important;
        }
      </style>
    `;
    cleanHtml = cleanHtml.includes('</head>') 
      ? cleanHtml.replace('</head>', fontTags + '</head>')
      : fontTags + cleanHtml;

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(cleanHtml);
    doc.close();

    const runCapture = async () => {
      try {
        // Wait for web fonts (Inter, Outfit) to be fully loaded so word metrics don't collapse
        if (doc.fonts && doc.fonts.ready) {
          try {
            await doc.fonts.ready;
          } catch (_) {}
        }

        // Wait for all images (borrower signature, officer signature, stamp) to decode
        const imgs = Array.from(doc.querySelectorAll('img'));
        if (imgs.length > 0) {
          await Promise.all(
            imgs.map(
              (img) =>
                new Promise((res) => {
                  if (img.complete && img.naturalWidth !== 0) return res();
                  img.onload = img.onerror = () => res();
                  setTimeout(res, 600);
                })
            )
          );
        }

        // Reflow delay
        await new Promise((r) => setTimeout(r, 200));

        // Calculate exact height based on number of .doc-page elements to prevent trailing blank pages
        const body = doc.body;
        const pages = Array.from(doc.querySelectorAll('.doc-page'));
        const exactHeight = pages.length > 0 ? Math.ceil(pages.length * 1131.428) : Math.max(body.scrollHeight, body.offsetHeight, 1000);
        
        iframe.style.height = `${exactHeight + 50}px`;

        // Render clean isolated body using html2canvas, strictly bound to exact document height
        const canvas = await html2canvas(body, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollY: 0,
          scrollX: 0,
          windowWidth: 800,
          width: 800,
          height: exactHeight,
        });

        // Convert canvas into clean A4 PDF
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = 210; // A4 mm
        const pageHeight = 297; // A4 mm
        const imgHeight = (canvas.height * pageWidth) / canvas.width;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight, undefined, 'FAST');
        let heightLeft = imgHeight - pageHeight;

        while (heightLeft > 10) {
          position -= pageHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight, undefined, 'FAST');
          heightLeft -= pageHeight;
        }

        const blob = pdf.output('blob');
        document.body.removeChild(iframe);
        resolve(blob);
      } catch (err) {
        try { document.body.removeChild(iframe); } catch (_) {}
        reject(err);
      }
    };

    setTimeout(runCapture, 100);
  });
}

/**
 * Upload a Blob to the `signed-docs` Supabase Storage bucket.
 * @param {Blob} blob
 * @param {string} path - Storage path e.g. "LN-XXXX/loan-agreement.pdf"
 * @returns {Promise<string>} Signed URL (valid 7 days)
 */
async function uploadAndSign(blob, path) {
  const { error: uploadError } = await supabase.storage
    .from('signed-docs')
    .upload(path, blob, {
      contentType: 'application/pdf',
      upsert: true,          // overwrite if re-sharing the same loan
    });

  if (uploadError) throw new Error(`Upload failed (${path}): ${uploadError.message}`);

  // Extract clean filename from path, e.g. "loan-agreement-LN-XXXX.pdf"
  const filename = path.split('/').pop() || 'document.pdf';

  const { data, error: urlError } = await supabase.storage
    .from('signed-docs')
    .createSignedUrl(path, 60 * 60 * 24 * 7, {
      download: filename,    // Forces direct PDF download (Content-Disposition: attachment)
    });

  if (urlError) throw new Error(`Signed URL failed (${path}): ${urlError.message}`);

  return data.signedUrl;
}

/**
 * Main entry point.
 *
 * @param {object} loan       - Loan record (must have borrower_signature set)
 * @param {object} customer   - Customer record (must have .phone and .name)
 * @param {string} agreementHTML - Output of generateLoanAgreementHTML(...)
 * @param {string} assetHTML     - Output of generateAssetListHTML(...)
 * @param {function} showToast   - Toast callback (message, type)
 */
export async function shareDocsViaWhatsApp(loan, customer, agreementHTML, assetHTML, showToast) {
  try {
    showToast('⏳ Generating PDFs & uploading… please wait.', 'info', 8000);

    // 1. Convert both HTML docs to PDF blobs in parallel
    const [agreementBlob, assetBlob] = await Promise.all([
      htmlToBlob(agreementHTML, `loan-agreement-${loan.id}.pdf`),
      htmlToBlob(assetHTML,     `asset-list-${loan.id}.pdf`),
    ]);

    // 2. Upload both to Supabase Storage and get signed URLs
    const storagePath = (name) => `${loan.id}/${name}`;
    const [agreementUrl, assetUrl] = await Promise.all([
      uploadAndSign(agreementBlob, storagePath(`loan-agreement-${loan.id}.pdf`)),
      uploadAndSign(assetBlob,     storagePath(`asset-list-${loan.id}.pdf`)),
    ]);

    // 3. Normalise customer phone to international format
    let phone = String(customer.phone || '').replace(/[\s\-()]/g, '').replace(/^\+/, '');
    if (phone.startsWith('0')) phone = '254' + phone.substring(1);
    else if (phone.length === 9) phone = '254' + phone;

    // 4. Build WhatsApp pre-filled message with clean download link
    const customerName = customer.name || customer.full_name || 'Valued Customer';
    const baseUrl = window.location.origin.includes('localhost') 
      ? window.location.origin 
      : 'https://adequatecapital.co.ke';
    const docPortalUrl = `${baseUrl}/docs/${loan.id}`;

    const text = [
      `Dear ${customerName},`,
      ``,
      `Your signed loan documents for *${loan.id}* are ready.`,
      ``,
      `📥 *Download your documents here:*`,
      docPortalUrl,
      ``,
      `• Loan Agreement (PDF)`,
      `• Asset Declaration List (PDF)`,
      ``,
      `– Intervention Capital Ltd`,
    ].join('\n');

    showToast('✅ Documents uploaded! Opening WhatsApp…', 'success', 4000);

    const encodedText = encodeURIComponent(text);
    const nativeUrl = `whatsapp://send?phone=${phone}&text=${encodedText}`;
    const webUrl = `https://wa.me/${phone}?text=${encodedText}`;

    // Use the standard wa.me link for all platforms. Mobile browsers intercept this natively and reliably open WhatsApp,
    // avoiding the strict user-gesture timeouts that block whatsapp:// scheme redirects.
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // Create a full-screen overlay prompting the user to click.
      // This provides a required synchronous user gesture to bypass strict mobile deep-link timeouts.
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;background:rgba(0,0,0,0.85);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;box-sizing:border-box;';
      
      overlay.innerHTML = `
        <div style="background:#ffffff;color:#0f172a;padding:32px 24px;border-radius:20px;text-align:center;max-width:360px;width:100%;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);">
          <div style="width:64px;height:64px;background:#22c55e;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 0 0 8px rgba(34,197,94,0.2);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
          </div>
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Ready to Send!</h2>
          <p style="margin:0 0 28px;color:#64748b;font-size:15px;line-height:1.5;">The loan documents have been generated and securely uploaded.</p>
          <button id="wa-btn-native" style="width:100%;background:#22c55e;color:#fff;border:none;padding:16px;border-radius:14px;font-size:16px;font-weight:700;cursor:pointer;margin-bottom:12px;box-shadow:0 4px 12px rgba(34,197,94,0.3);">Open WhatsApp</button>
          <button id="wa-btn-web" style="width:100%;background:transparent;color:#94a3b8;border:none;padding:12px;font-size:15px;cursor:pointer;font-weight:600;">Cancel / Close</button>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      document.getElementById('wa-btn-native').onclick = () => {
        let didHide = false;
        const onHide = () => { didHide = true; };
        document.addEventListener('visibilitychange', onHide);
        window.location.href = nativeUrl;
        
        setTimeout(() => {
          document.removeEventListener('visibilitychange', onHide);
          if (!didHide && !document.hidden && document.body.contains(overlay)) {
            window.location.href = webUrl;
          }
          if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
        }, 1000);
      };
      
      document.getElementById('wa-btn-web').onclick = () => {
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      };
    } else {
      try {
        const a = document.createElement('a');
        a.href = nativeUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (_) {
        window.open(webUrl, '_blank');
      }
    }

  } catch (err) {
    console.error('[shareDocsViaWhatsApp]', err);
    showToast(`❌ Share failed: ${err.message}`, 'danger', 8000);
  }
}
