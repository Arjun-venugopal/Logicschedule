"use client";

import { useRef, useState } from "react";
import { Download, Printer } from "lucide-react";

interface ReportData {
  studentName: string;
  age?: number | null;
  className?: string;
  tutor?: string;
  courseSelected?: string;
  scores: {
    introductionToInterface: number;
    blocksAndCommands: number;
    logicAndProblemSolving: number;
    creativityAndProjectBuilding: number;
    communicationAndParticipation: number;
    timeManagement: number;
  };
  taskRemarks?: {
    introductionToInterface?: string;
    blocksAndCommands?: string;
    logicAndProblemSolving?: string;
    creativityAndProjectBuilding?: string;
    communicationAndParticipation?: string;
    timeManagement?: string;
  };
  totalScore: number;
  overallRemarks?: string;
  date?: string;
}

interface Props {
  report: ReportData;
  onClose?: () => void;
}

const TASKS = [
  { key: "introductionToInterface" as const, label: "Introduction to Interface", icon: "🧩" },
  { key: "blocksAndCommands" as const, label: "Blocks & Commands", icon: "🧱" },
  { key: "logicAndProblemSolving" as const, label: "Logic & Problem Solving", icon: "</>" },
  { key: "creativityAndProjectBuilding" as const, label: "Creativity & Project Building", icon: "💡" },
  { key: "communicationAndParticipation" as const, label: "Communication & Participation", icon: "💬" },
  { key: "timeManagement" as const, label: "Time Management", icon: "⏱️" },
];

export default function DemoReportPDF({ report, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePrint = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    let iframe: HTMLIFrameElement | null = null;
    try {
      const reportDate = report.date ? new Date(report.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

      const htmlString = `\n
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', sans-serif;
      background: white;
      color: #1f2937;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .pdf-container {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 40px 50px;
      position: relative;
      background: white;
    }
    
    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #f3f4f6;
      margin-bottom: 30px;
    }

    .logo-img {
      height: 45px;
      object-fit: contain;
    }

    .company-info {
      text-align: right;
      font-size: 10px;
      color: #6b7280;
      line-height: 1.5;
    }
    
    .company-name {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }

    /* Title */
    .title-section {
      text-align: left;
      margin-bottom: 35px;
    }
    
    .title-sub {
      font-size: 11px;
      color: #6b7280;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    
    .title-main {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
    }

    /* Student Info Grid */
    .student-info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 40px;
      padding: 24px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .info-label {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .info-value {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }

    /* Scoring Table */
    .scoring-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 40px;
    }
    
    .scoring-table th {
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-align: left;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .scoring-table td {
      padding: 16px;
      font-size: 13px;
      color: #374151;
      border-bottom: 1px solid #f3f4f6;
      vertical-align: middle;
    }
    
    .task-cell {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 500;
      color: #111827;
    }
    
    .task-icon {
      font-size: 16px;
      color: #9ca3af;
    }
    
    .score-cell {
      font-weight: 600;
      color: #111827;
    }
    
    .total-row td {
      background: #f9fafb;
      border-bottom: none;
      font-weight: 700;
      border-top: 2px solid #e5e7eb;
    }
    
    .total-label {
      font-size: 13px;
      color: #111827;
    }

    /* Remarks */
    .remarks-section {
      padding: 24px;
      background: #f9fafb;
      border-left: 4px solid #f97316;
      border-radius: 4px 8px 8px 4px;
    }
    
    .remarks-title {
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .remark-text {
      font-size: 13px;
      line-height: 1.6;
      color: #374151;
    }

    /* Footer */
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      position: absolute;
      bottom: 50px;
      left: 50px;
      right: 50px;
    }
    
    .footer-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 200px;
    }
    
    .footer-line {
      width: 100%;
      height: 1px;
      background: #d1d5db;
    }
    
    .footer-label {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .footer-value {
      font-size: 12px;
      font-weight: 500;
      color: #111827;
      min-height: 15px;
    }
  </style>

  <div class="pdf-container">
    
    <!-- Header -->
    <div class="header">
      <img src="${window.location.origin}/logicbox-logo.png" class="logo-img" crossorigin="anonymous" />
      <div class="company-info">
        <div class="company-name">LOGICBOX INNOVATION PRIVATE LIMITED</div>
        <div>CIN: U85499KL2025PTC097626</div>
        <div>Near Cochin International Airport,</div>
        <div>Ernakulam, Kerala, India-683589</div>
      </div>
    </div>

    <!-- Title -->
    <div class="title-section">
      <div class="title-sub">Demo Session Attended</div>
      <div class="title-main">Student Performance Report</div>
    </div>

    <!-- Student Info -->
    <div class="student-info-grid">
      <div class="info-item">
        <div class="info-label">Student Name</div>
        <div class="info-value">${report.studentName || "-"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Course Selected</div>
        <div class="info-value">${report.courseSelected || "-"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Age / Class</div>
        <div class="info-value">${report.age || "-"} / ${report.className || "-"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Assigned Tutor</div>
        <div class="info-value">${report.tutor || "-"}</div>
      </div>
    </div>

    <!-- Scoring Table -->
    <table class="scoring-table">
      <thead>
        <tr>
          <th style="width: 35%">Evaluation Area</th>
          <th style="width: 20%">Score (10)</th>
          <th style="width: 45%">Specific Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${TASKS.map(({ key, label, icon }) => `
        <tr>
          <td>
            <div class="task-cell">
              <span class="task-icon">${icon}</span>
              ${label}
            </div>
          </td>
          <td class="score-cell">${report.scores[key] || 0} / 10</td>
          <td>${report.taskRemarks?.[key] || "-"}</td>
        </tr>`).join("")}
        <tr class="total-row">
          <td><div class="total-label">Total Assessment Score</div></td>
          <td class="score-cell">${report.totalScore} / 60</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <!-- Overall Remarks -->
    <div class="remarks-section">
      <div class="remarks-title">Overall Assessment Summary</div>
      <div class="remark-text">${report.overallRemarks ? report.overallRemarks.replace(/\n/g, "<br/>") : "The student demonstrated strong interest and enthusiasm during the demo session. They participated actively and showed a clear willingness to learn new concepts. Based on their performance, we recommend enrolling in the program to build a strong foundation in computational thinking through hands-on activities."}</div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="footer-item">
        <div class="footer-value">${reportDate}</div>
        <div class="footer-line"></div>
        <div class="footer-label">Date</div>
      </div>
      <div class="footer-item">
        <div class="footer-value"></div>
        <div class="footer-line"></div>
        <div class="footer-label">Tutor Signature</div>
      </div>
      <div class="footer-item">
        <div class="footer-value"></div>
        <div class="footer-line"></div>
        <div class="footer-label">Center Authority</div>
      </div>
    </div>

  </div>
  `;

      // Create isolated iframe to avoid html2canvas crashing on parent Tailwind v4 oklch() colors
      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '800px';
      iframe.style.height = '1200px';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-1000';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error("Could not create isolated iframe for PDF generation.");

      iframeDoc.open();
      // Write the complete HTML document to the iframe
      iframeDoc.write(`<!DOCTYPE html><html><head></head><body>${htmlString}</body></html>`);
      iframeDoc.close();

      // Dynamically load heavy libraries while DOM is rendering to save time
      const [html2canvasModule, jsPDFModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);

      const html2canvas = html2canvasModule.default;
      // @ts-ignore
      const JsPDFConstructor = jsPDFModule.default?.jsPDF || jsPDFModule.default || jsPDFModule.jsPDF || jsPDFModule;

      // Wait for iframe resources (like the logo image and fonts) to fully load
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => resolve(), 1500); // 1.5s fallback timeout

        if (iframeDoc.readyState === 'complete') {
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        const images = Array.from(iframeDoc.images);
        if (images.length === 0) {
          iframe!.addEventListener('load', () => {
            clearTimeout(timeoutId);
            resolve();
          });
        } else {
          let loadedImages = 0;
          const checkDone = () => {
            loadedImages++;
            if (loadedImages === images.length) {
              clearTimeout(timeoutId);
              setTimeout(resolve, 50); // slight delay for paint
            }
          };
          images.forEach(img => {
            if (img.complete) {
              checkDone();
            } else {
              img.addEventListener('load', checkDone);
              img.addEventListener('error', checkDone);
            }
          });
        }
      });

      const canvas = await html2canvas(iframeDoc.body, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: 800,
        windowWidth: 800,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      const pdf = new JsPDFConstructor({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Performance_Report_${(report.studentName || 'Student').replace(/\s+/g, '_')}.pdf`);

    } catch (error: any) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF: " + (error?.message || String(error)));
    } finally {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={handlePrint}
      disabled={isGenerating}
      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold rounded-xl transition-all text-sm shadow-lg shadow-amber-500/20 disabled:opacity-50"
    >
      <Download className={`w-4 h-4 ${isGenerating ? 'animate-bounce' : ''}`} />
      {isGenerating ? "Generating PDF..." : "Download PDF"}
    </button>
  );
}
