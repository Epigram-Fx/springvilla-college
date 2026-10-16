import {
  Document,
  Page,
  Path,
  PDFDownloadLink,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View
} from "@react-pdf/renderer";

export type AdmissionLetterDetails = {
  studentName: string;
  admissionNumber: string;
  department: string;
  session: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 52,
    backgroundColor: "#ffffff",
    color: "#1f2937",
    fontFamily: "Helvetica"
  },
  border: {
    position: "absolute",
    top: 24,
    right: 24,
    bottom: 24,
    left: 24,
    borderWidth: 2,
    borderColor: "#15803d"
  },
  header: {
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#bbf7d0",
    paddingBottom: 24,
    marginBottom: 30
  },
  logo: {
    width: 58,
    height: 58,
    marginBottom: 12
  },
  school: {
    color: "#166534",
    fontSize: 19,
    fontWeight: "bold",
    textAlign: "center"
  },
  subheading: {
    marginTop: 5,
    color: "#64748b",
    fontSize: 10,
    letterSpacing: 1.2
  },
  date: {
    marginBottom: 30,
    textAlign: "right",
    fontSize: 10,
    color: "#475569"
  },
  title: {
    marginBottom: 24,
    textAlign: "center",
    color: "#166534",
    fontSize: 17,
    fontWeight: "bold",
    letterSpacing: 1
  },
  body: {
    marginBottom: 16,
    fontSize: 12,
    lineHeight: 1.8
  },
  detail: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 3,
    borderLeftColor: "#15803d",
    fontSize: 11,
    lineHeight: 1.7
  },
  signature: {
    marginTop: 44,
    fontSize: 11,
    lineHeight: 1.7
  },
  signatureLine: {
    width: 180,
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: "#64748b"
  }
});

function CollegeLogo() {
  return (
    <Svg style={styles.logo} viewBox="0 0 64 64">
      <Rect width="64" height="64" rx="14" fill="#15803d" />
      <Path d="M14 24 32 14l18 10v3H14zm4 5h5v16h-5zm11 0h6v16h-6zm12 0h5v16h-5zM14 48h36v4H14z" fill="#fff" />
    </Svg>
  );
}

function LetterDocument({ details }: { details: AdmissionLetterDetails }) {
  const date = new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  return (
    <Document
      author="SpringVilla College of Technology"
      title={`Admission letter - ${details.studentName}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.border} />
        <View style={styles.header}>
          <CollegeLogo />
          <Text style={styles.school}>SpringVilla College of Technology</Text>
          <Text style={styles.subheading}>OFFICE OF ADMISSIONS</Text>
        </View>
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.title}>OFFER OF ADMISSION</Text>
        <Text style={styles.body}>Dear {details.studentName},</Text>
        <Text style={styles.body}>
          Congratulations! We are pleased to offer you admission to SpringVilla
          College of Technology. We welcome you to our academic community and
          look forward to supporting your success.
        </Text>
        <View style={styles.detail}>
          <Text>Admission number: {details.admissionNumber}</Text>
          <Text>Department: {details.department}</Text>
          <Text>Academic session: {details.session}</Text>
        </View>
        <Text style={styles.body}>
          Please sign in to the admissions portal for updates and further
          information about your studies. Keep this letter for your records.
        </Text>
        <View style={styles.signature}>
          <Text>Yours faithfully,</Text>
          <View style={styles.signatureLine} />
          <Text>Registrar</Text>
          <Text>SpringVilla College of Technology</Text>
        </View>
      </Page>
    </Document>
  );
}

export function AdmissionLetterDownload({
  details
}: {
  details: AdmissionLetterDetails;
}) {
  const fileName = `SpringVilla-admission-${details.admissionNumber}.pdf`;
  return (
    <PDFDownloadLink
      className="inline-flex items-center justify-center rounded-md bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
      document={<LetterDocument details={details} />}
      fileName={fileName}
    >
      {({ loading }) => (loading ? "Preparing your letter…" : "Download admission letter")}
    </PDFDownloadLink>
  );
}
