// apps/web/lib/pdf-generator.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface CertParams {
  patientName: string;
  diagnosis: string;
  date: string;
}

export async function generatePDF({ patientName, diagnosis, date }: CertParams): Promise<Buffer> {
  // 1. Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // 2. Embed the standard font (no file system required!)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  // 3. Add a blank page
  const page = pdfDoc.addPage([600, 400]);
  const { height } = page.getSize();

  // 4. Draw the text
  page.drawText('Medical Certificate', {
    x: 50,
    y: height - 80,
    size: 24,
    font: font,
    color: rgb(0, 0.35, 0.71), // A nice medical blue
  });

  page.drawText(`Patient Name: ${patientName}`, { x: 50, y: height - 130, size: 14, font });
  page.drawText(`Diagnosis: ${diagnosis}`, { x: 50, y: height - 160, size: 14, font });
  page.drawText(`Issued On: ${new Date(date).toLocaleDateString()}`, { x: 50, y: height - 190, size: 14, font });
  
  page.drawText('Authorized by University Medical Center', { 
    x: 50, 
    y: 50, 
    size: 10, 
    font, 
    color: rgb(0.5, 0.5, 0.5) 
  });

  // 5. Serialize the PDF to bytes and return as a Node Buffer for Supabase
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}