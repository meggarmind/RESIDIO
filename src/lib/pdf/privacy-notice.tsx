import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: '#166534',
    paddingBottom: 12,
    marginBottom: 20,
  },
  estateName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#166534',
  },
  title: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
  },
  version: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 4,
  },
  paragraph: {
    marginBottom: 8,
  },
});

/** The WhatsApp privacy notice (#871): the admin-set text, one paragraph per blank-line block. */
export function PrivacyNoticePDF({ estateName, version, text }: { estateName: string; version: string; text: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.estateName}>{estateName}</Text>
          <Text style={styles.title}>WhatsApp assistant privacy notice</Text>
          <Text style={styles.version}>Version {version}</Text>
        </View>
        {text.split(/\n\s*\n/).map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>{paragraph.trim()}</Text>
        ))}
      </Page>
    </Document>
  );
}
