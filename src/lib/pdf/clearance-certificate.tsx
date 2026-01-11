import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { format } from 'date-fns';
import type { ClearanceCertificate } from '@/actions/residents/move-out-renter';

// Styles for PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
  },
  // Watermark
  watermark: {
    position: 'absolute',
    top: 350,
    left: 100,
    opacity: 0.08,
  },
  watermarkText: {
    fontSize: 100,
    color: '#166534',
    fontFamily: 'Helvetica-Bold',
    transform: 'rotate(-45deg)',
  },
  // Header
  header: {
    borderBottomWidth: 3,
    borderBottomColor: '#166534',
    paddingBottom: 20,
    marginBottom: 25,
  },
  estateName: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#166534',
  },
  documentTitle: {
    fontSize: 18,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    marginTop: 10,
    color: '#1a1a1a',
  },
  certificateNumber: {
    fontSize: 11,
    textAlign: 'center',
    color: '#666666',
    marginTop: 6,
    fontFamily: 'Helvetica',
  },
  // Content
  content: {
    marginTop: 20,
  },
  statement: {
    fontSize: 12,
    lineHeight: 1.8,
    textAlign: 'justify',
    marginBottom: 20,
  },
  // Info sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
    textTransform: 'uppercase',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    paddingBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#666666',
    width: 150,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: 'Helvetica',
    flex: 1,
  },
  // Validity box
  validityBox: {
    backgroundColor: '#dcfce7',
    padding: 15,
    borderRadius: 6,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#166534',
  },
  validityTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
    marginBottom: 8,
    textAlign: 'center',
  },
  validityText: {
    fontSize: 11,
    color: '#166534',
    textAlign: 'center',
  },
  validityDate: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
    textAlign: 'center',
    marginTop: 4,
  },
  // Destination section
  destinationBox: {
    backgroundColor: '#f0f9ff',
    padding: 12,
    borderRadius: 4,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#0ea5e9',
  },
  destinationTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0369a1',
    marginBottom: 4,
  },
  destinationText: {
    fontSize: 10,
    color: '#0369a1',
  },
  // Notes
  notes: {
    fontSize: 9,
    color: '#666666',
    lineHeight: 1.6,
    marginTop: 20,
    fontStyle: 'italic',
  },
  noteItem: {
    marginBottom: 4,
  },
  // Signature area
  signatureSection: {
    marginTop: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureBlock: {
    width: '45%',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    marginBottom: 4,
    height: 40,
  },
  signatureLabel: {
    fontSize: 9,
    color: '#666666',
  },
  // Footer
  footer: {
    borderTopWidth: 2,
    borderTopColor: '#166534',
    paddingTop: 15,
    marginTop: 'auto',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: '#999999',
  },
  footerBrand: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#999999',
  },
});

interface ClearanceCertificatePDFProps {
  certificate: ClearanceCertificate;
  estateName?: string;
  estateAddress?: string;
}

/**
 * PDF Clearance Certificate Component
 *
 * Generates a downloadable PDF clearance certificate for renter move-out.
 * Uses @react-pdf/renderer for server-side PDF generation.
 */
export function ClearanceCertificatePDF({
  certificate,
  estateName = 'Residio Estate',
  estateAddress = '',
}: ClearanceCertificatePDFProps) {
  const clearanceDate = new Date(certificate.clearanceDate);
  const validUntilDate = new Date(certificate.validUntil);

  const destinationText =
    certificate.destination === 'leaving_estate'
      ? 'The resident is leaving the estate permanently.'
      : certificate.destinationHouse
      ? `Moving to: ${certificate.destinationHouse.address} as ${certificate.destinationHouse.role.replace(/_/g, ' ')}`
      : 'Moving to another property within the estate.';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Watermark */}
        <View fixed style={styles.watermark}>
          <Text style={styles.watermarkText}>CLEARED</Text>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.estateName}>{estateName}</Text>
          <Text style={styles.documentTitle}>CLEARANCE CERTIFICATE</Text>
          <Text style={styles.certificateNumber}>
            Certificate No: {certificate.certificateNumber}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Opening statement */}
          <Text style={styles.statement}>
            This is to certify that the below-named resident has been cleared of all
            financial obligations to {estateName} as of the date indicated below and
            is hereby authorized to vacate the premises.
          </Text>

          {/* Resident Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resident Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name:</Text>
              <Text style={styles.infoValue}>{certificate.residentName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Resident Code:</Text>
              <Text style={styles.infoValue}>{certificate.residentCode}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Property Address:</Text>
              <Text style={styles.infoValue}>{certificate.houseAddress}</Text>
            </View>
          </View>

          {/* Clearance Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Clearance Details</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Clearance Date:</Text>
              <Text style={styles.infoValue}>
                {format(clearanceDate, 'MMMM d, yyyy')}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text style={styles.infoValue}>
                {certificate.status === 'confirmed'
                  ? 'CONFIRMED'
                  : certificate.status === 'expired'
                  ? 'EXPIRED'
                  : 'PENDING CONFIRMATION'}
              </Text>
            </View>
          </View>

          {/* Validity Box */}
          <View style={styles.validityBox}>
            <Text style={styles.validityTitle}>VALIDITY PERIOD</Text>
            <Text style={styles.validityText}>
              This certificate is valid for {certificate.validityDays} days until:
            </Text>
            <Text style={styles.validityDate}>
              {format(validUntilDate, 'MMMM d, yyyy')}
            </Text>
          </View>

          {/* Destination */}
          <View style={styles.destinationBox}>
            <Text style={styles.destinationTitle}>MOVE-OUT DESTINATION</Text>
            <Text style={styles.destinationText}>{destinationText}</Text>
          </View>

          {/* Notes */}
          <View>
            <Text style={styles.notes}>
              <Text style={styles.noteItem}>
                • Physical move-out must be confirmed by Estate Security (CSO) before this
                certificate is fully processed.
              </Text>
              {'\n'}
              <Text style={styles.noteItem}>
                • If the validity period expires without CSO confirmation, residency billing
                may resume.
              </Text>
              {'\n'}
              <Text style={styles.noteItem}>
                • This certificate does not transfer any rights or obligations to third parties.
              </Text>
              {'\n'}
              <Text style={styles.noteItem}>
                • Please retain this certificate for your records.
              </Text>
            </Text>
          </View>

          {/* Signature Section */}
          <View style={styles.signatureSection}>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Authorized Signature</Text>
            </View>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>CSO Confirmation</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <View>
              <Text style={styles.footerBrand}>{estateName}</Text>
              {estateAddress && (
                <Text style={styles.footerText}>{estateAddress}</Text>
              )}
              <Text style={styles.footerText}>Powered by Residio</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.footerText}>
                Generated: {format(new Date(), 'MMM d, yyyy HH:mm')}
              </Text>
              <Text style={styles.footerText}>
                Certificate: {certificate.certificateNumber}
              </Text>
              <Text style={styles.footerText}>Page 1 of 1</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
