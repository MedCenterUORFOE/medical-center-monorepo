import PDFDocument from 'pdfkit';

interface CertificateData {
  patientName: string;
  diagnosis: string;
  date: string;
}

export async function generatePDF(data: CertificateData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // 1. Initialize a new PDF document in memory
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      // 2. Stream the document data into our buffer array
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // 3. Draw the PDF Content
      // --- Header ---
      doc.fontSize(20).font('Helvetica-Bold').text('University Medical Center', { align: 'center' });
      doc.fontSize(14).font('Helvetica').text('University of Ruhuna', { align: 'center' });
      doc.moveDown(2);
      
      doc.fontSize(16).font('Helvetica-Bold').text('MEDICAL CERTIFICATE', { align: 'center', underline: true });
      doc.moveDown(3);

      // --- Body ---
      doc.fontSize(12).font('Helvetica');
      doc.text(`Date Issued: ${new Date(data.date).toLocaleDateString()}`, { align: 'right' });
      doc.moveDown(2);

      doc.text(`This is to certify that `, { continued: true })
         .font('Helvetica-Bold').text(data.patientName, { continued: true })
         .font('Helvetica').text(` has been examined at the University Medical Center.`);
      
      doc.moveDown(1.5);
      
      doc.text(`Diagnosis / Authorized Reason for Leave:`);
      doc.moveDown(0.5);
      doc.font('Helvetica-Oblique').text(data.diagnosis, { indent: 20 });
      doc.moveDown(3);

      // --- Footer ---
      doc.font('Helvetica').text('This certificate is automatically generated and authorized by the University Medical Center Management System.');
      doc.moveDown(4);
      
      doc.text('__________________________________', { align: 'right' });
      doc.text('Chief Medical Officer / Authorized Staff', { align: 'right' });

      // 4. Finalize the PDF
      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}