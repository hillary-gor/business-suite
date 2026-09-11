import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatMoney } from '@/lib/money';
import {
  CHART_DEFINITIONS,
  type PerformancePayload,
  type PerformanceWidget,
} from '@/lib/performance-centre';
import { widgetView } from '@/lib/performance-view';
import { formatReportDateRange, reportPeriodRange } from '@/lib/report-periods';
import { PerformancePdfChart } from '@/server/pdf/performance-charts';

const INK = '#1d1d1f';
const MUTED = '#6e6e73';
const LINE = '#e8e8ed';

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: INK,
  },
  banner: {
    fontSize: 8,
    color: MUTED,
    marginBottom: 28,
    textAlign: 'center',
  },
  company: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  period: {
    fontSize: 9,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 14,
  },
  value: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 18,
  },
  table: {
    width: '78%',
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingVertical: 6,
  },
  head: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: MUTED,
  },
  cell: { flex: 1 },
  num: { flex: 1, textAlign: 'right' },
  legend: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 8,
    color: MUTED,
  },
});

export function PerformancePdf({
  companyName,
  currency,
  updatedAt,
  payload,
  charts,
}: {
  companyName: string;
  currency: string;
  updatedAt: string;
  payload: PerformancePayload;
  charts: readonly PerformanceWidget[];
}) {
  const total = charts.length;
  return (
    <Document>
      {charts.map((widget, index) => {
        const view = widgetView(widget, payload, payload.asAt);
        const def = CHART_DEFINITIONS[widget.metric];
        const headline = view.isMoney
          ? formatMoney(view.headline, { currency, showCurrency: true })
          : view.headline;
        const range = reportPeriodRange(widget.period, payload.asAt);
        const periodLine = view.aging
          ? `As of ${formatReportDateRange(payload.asAt, payload.asAt)}`
          : `${view.periodLabel} · ${formatReportDateRange(range.from, range.to)}`;
        return (
          <Page key={widget.id} size="A4" style={styles.page}>
            <Text style={styles.banner}>
              Accounting method: Accrual basis | Data updated {updatedAt} {index + 1}/{total}
            </Text>
            <Text style={styles.company}>{companyName}</Text>
            <Text style={styles.title}>{view.title}</Text>
            <Text style={styles.period}>{periodLine}</Text>
            <Text style={styles.value}>{headline}</Text>
            <Text style={styles.subtitle}>{view.subtitle}</Text>
            <PerformancePdfChart view={view} style={widget.style} currency={currency} />
            {view.aging ? (
              <View style={styles.table}>
                <View style={[styles.row, styles.head]}>
                  <Text style={styles.cell}>Ageing Buckets</Text>
                  <Text style={styles.num}>{def.shortName}</Text>
                </View>
                {view.aging.map((slice) => (
                  <View key={slice.bucket} style={styles.row}>
                    <Text style={styles.cell}>{slice.label}</Text>
                    <Text style={styles.num}>
                      {formatMoney(slice.amount, { currency, showCurrency: true })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : view.cash ? (
              <View style={styles.table}>
                <View style={[styles.row, styles.head]}>
                  <Text style={styles.cell}>Time period</Text>
                  <Text style={styles.num}>Investing activities</Text>
                  <Text style={styles.num}>Operating activities</Text>
                  <Text style={styles.num}>Financing activities</Text>
                </View>
                {view.cash.operating.map((point, monthIndex) => (
                  <View key={point.key} style={styles.row}>
                    <Text style={styles.cell}>{point.label}</Text>
                    <Text style={styles.num}>
                      {formatMoney(view.cash?.investing[monthIndex]?.amount ?? '0', {
                        currency,
                        showCurrency: true,
                      })}
                    </Text>
                    <Text style={styles.num}>
                      {formatMoney(point.amount, { currency, showCurrency: true })}
                    </Text>
                    <Text style={styles.num}>
                      {formatMoney(view.cash?.financing[monthIndex]?.amount ?? '0', {
                        currency,
                        showCurrency: true,
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.table}>
                <View style={[styles.row, styles.head]}>
                  <Text style={styles.cell}>Time period</Text>
                  <Text style={styles.num}>{def.shortName}</Text>
                  <Text
                    style={styles.num}
                  >{`${def.shortName} (${Number(payload.asAt.slice(0, 4)) - 1})`}</Text>
                </View>
                {view.series.map((point) => (
                  <View key={point.key} style={styles.row}>
                    <Text style={styles.cell}>{point.label}</Text>
                    <Text style={styles.num}>
                      {view.isMoney
                        ? formatMoney(point.amount || '0', { currency, showCurrency: true })
                        : point.amount || ''}
                    </Text>
                    <Text style={styles.num}>
                      {view.isMoney
                        ? formatMoney(point.prior || '0', { currency, showCurrency: true })
                        : point.prior || ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.legend}>
              {view.cash
                ? 'Investing activities    Operating activities    Financing activities'
                : view.aging
                  ? view.aging.map((slice) => slice.label).join('    ')
                  : `${def.shortName}    ${def.shortName} (${Number(payload.asAt.slice(0, 4)) - 1})`}
            </Text>
          </Page>
        );
      })}
    </Document>
  );
}
