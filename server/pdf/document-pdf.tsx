import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatDisplayDate } from '@/lib/payables';
import { formatMoney, formatQuantity } from '@/lib/money';
import type { DocumentColumnKey } from '@/lib/documents/kinds';
import type { DocumentLine, DocumentModel } from '@/lib/documents/model';

const BRAND = '#0071e3';
const INK = '#18181b';
const MUTED = '#52525b';
const LINE = '#e4e4e7';

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    gap: 16,
  },
  kicker: {
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  brand: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: BRAND,
    marginBottom: 4,
  },
  muted: {
    color: MUTED,
    marginBottom: 2,
  },
  logo: {
    width: 88,
    height: 44,
    objectFit: 'contain',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 24,
    marginBottom: 16,
  },
  partyName: {
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 4,
  },
  pre: {
    lineHeight: 1.4,
  },
  dl: {
    minWidth: 180,
  },
  dlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 3,
  },
  dt: {
    color: MUTED,
  },
  table: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 5,
  },
  th: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: MUTED,
    textTransform: 'uppercase',
  },
  totals: {
    marginTop: 10,
    alignSelf: 'flex-end',
    width: 220,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  totalStrong: {
    fontFamily: 'Helvetica-Bold',
  },
  notes: {
    marginTop: 16,
  },
  notesTitle: {
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  signatures: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 28,
  },
  sign: {
    flex: 1,
  },
  signLine: {
    marginTop: 28,
    borderBottomWidth: 1,
    borderBottomColor: INK,
  },
  footer: {
    position: 'absolute',
    left: 36,
    right: 36,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: MUTED,
    fontSize: 8,
  },
});

const COLUMN_FLEX: Record<DocumentColumnKey, number> = {
  description: 3,
  sku: 1.2,
  quantity: 0.8,
  unitPrice: 1.1,
  taxLabel: 1,
  amount: 1.2,
  extra: 1.4,
};

function cellValue(line: DocumentLine, key: DocumentColumnKey, currency: string): string {
  switch (key) {
    case 'description':
      return line.description || '—';
    case 'sku':
      return line.sku || '—';
    case 'quantity':
      return line.quantity ? formatQuantity(line.quantity) : '';
    case 'unitPrice':
      return line.unitPrice ? formatMoney(line.unitPrice, { currency, showCurrency: false }) : '';
    case 'taxLabel':
      return line.taxLabel || '—';
    case 'amount':
      return line.amount ? formatMoney(line.amount, { currency, showCurrency: true }) : '';
    case 'extra':
      return line.extra || '';
  }
}

function PartyBlock({ label, party }: { label: string; party: DocumentModel['party'] }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.partyName}>{party.name}</Text>
      {party.email ? <Text style={styles.muted}>{party.email}</Text> : null}
      {party.phone ? <Text style={styles.muted}>{party.phone}</Text> : null}
      {party.address ? <Text style={styles.pre}>{party.address}</Text> : null}
    </View>
  );
}

export function DocumentPdf({ model }: { model: DocumentModel }) {
  const currency = model.totals?.currency ?? 'Ksh';
  const columns = model.columns.filter((column) => {
    if (model.showMoney) return true;
    return column.key !== 'unitPrice' && column.key !== 'taxLabel' && column.key !== 'amount';
  });

  return (
    <Document title={`${model.title} ${model.number}`} author={model.company.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <View>
            <Text style={styles.kicker}>{model.title}</Text>
            <Text style={styles.title}>
              {model.title} {model.number}
            </Text>
            <Text style={styles.brand}>{model.company.tradingName || model.company.name}</Text>
            {model.company.address ? (
              <Text style={styles.muted}>{model.company.address}</Text>
            ) : null}
            {model.company.email ? <Text style={styles.muted}>{model.company.email}</Text> : null}
            {model.company.phone ? <Text style={styles.muted}>{model.company.phone}</Text> : null}
            {model.company.registrationNumber ? (
              <Text style={styles.muted}>Reg. {model.company.registrationNumber}</Text>
            ) : null}
            {model.company.taxPin ? (
              <Text style={styles.muted}>PIN {model.company.taxPin}</Text>
            ) : null}
          </View>
          {model.company.logoDataUri ? (
            <Image src={model.company.logoDataUri} style={styles.logo} />
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <View style={{ flex: 1, gap: 10 }}>
            <PartyBlock label={model.partyLabel} party={model.party} />
            {model.shipTo?.name || model.shipTo?.address ? (
              <PartyBlock label="Ship to" party={model.shipTo} />
            ) : null}
          </View>
          <View style={styles.dl}>
            <View style={styles.dlRow}>
              <Text style={styles.dt}>{model.numberLabel}</Text>
              <Text>{model.number}</Text>
            </View>
            <View style={styles.dlRow}>
              <Text style={styles.dt}>Date</Text>
              <Text>{formatDisplayDate(model.issueDate)}</Text>
            </View>
            {model.dueDate ? (
              <View style={styles.dlRow}>
                <Text style={styles.dt}>Due date</Text>
                <Text>{formatDisplayDate(model.dueDate)}</Text>
              </View>
            ) : null}
            {model.meta.map((field) => (
              <View key={`${field.label}-${field.value}`} style={styles.dlRow}>
                <Text style={styles.dt}>{field.label}</Text>
                <Text>{field.value}</Text>
              </View>
            ))}
            {model.showMoney && model.totals ? (
              <View style={styles.dlRow}>
                <Text style={styles.dt}>{model.totals.balance ? 'Balance' : 'Total'}</Text>
                <Text>
                  {formatMoney(model.totals.balance || model.totals.total, {
                    currency,
                    showCurrency: true,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tr}>
            {columns.map((column) => (
              <Text
                key={column.key}
                style={[
                  styles.th,
                  { flex: COLUMN_FLEX[column.key], textAlign: column.align ?? 'left' },
                ]}
              >
                {column.label}
              </Text>
            ))}
          </View>
          {model.lines.length === 0 ? (
            <View style={styles.tr}>
              <Text>No lines.</Text>
            </View>
          ) : (
            model.lines.map((line, index) => (
              <View key={`${line.description}-${index}`} style={styles.tr} wrap={false}>
                {columns.map((column) => (
                  <Text
                    key={column.key}
                    style={{ flex: COLUMN_FLEX[column.key], textAlign: column.align ?? 'left' }}
                  >
                    {cellValue(line, column.key, currency)}
                  </Text>
                ))}
              </View>
            ))
          )}
        </View>

        {model.showMoney && model.totals ? (
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{formatMoney(model.totals.subtotal, { currency, showCurrency: true })}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>Tax</Text>
              <Text>{formatMoney(model.totals.tax, { currency, showCurrency: true })}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalStrong}>Total</Text>
              <Text style={styles.totalStrong}>
                {formatMoney(model.totals.total, { currency, showCurrency: true })}
              </Text>
            </View>
          </View>
        ) : null}

        {model.terms ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Terms</Text>
            <Text style={styles.pre}>{model.terms}</Text>
          </View>
        ) : null}

        {model.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.pre}>{model.notes}</Text>
          </View>
        ) : null}

        {model.references.length > 0 ? (
          <View style={styles.notes}>
            <Text style={styles.notesTitle}>References</Text>
            {model.references.map((field) => (
              <Text key={`${field.label}-${field.value}`}>
                {field.label}: {field.value}
              </Text>
            ))}
          </View>
        ) : null}

        {model.attachmentsNote ? (
          <View style={styles.notes}>
            <Text style={styles.muted}>{model.attachmentsNote}</Text>
          </View>
        ) : null}

        {model.signatures.length > 0 ? (
          <View style={styles.signatures}>
            {model.signatures.map((block) => (
              <View key={block.label} style={styles.sign}>
                <Text style={styles.sectionLabel}>{block.label}</Text>
                <View style={styles.signLine} />
                {block.hint ? <Text style={styles.muted}>{block.hint}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>{model.company.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
