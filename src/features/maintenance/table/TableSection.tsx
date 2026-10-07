import { useState } from 'react';

import { tableIssues, type ServiceTable, type ServiceTableRow, type TableAction } from '@/domain';
import { useAppData } from '@/features/data/DataContext';
import type { ServiceTableVM } from '@/features/data/types';
import { he } from '@/i18n/he';
import { AppText, Button, Card, Dialog, InlineNotice, spacing, Stack, StatusCard } from '@/ui';

import { FIESTA_2012_TABLE } from './fiesta2012';
import { TableGrid } from './TableGrid';
import { CellSheet, RowSheet, ShapeSheet } from './TableSheets';
import { useTableImport } from './useTableImport';

const t = he.serviceTable;

/**
 * "לוח טיפולים" (owner decision 2026-10-06): the owner's table exactly as the booklet builds it.
 * Photographed / uploaded and read on the device, transcribed, or typed — every way ends in a
 * proposal the owner checks against the booklet and approves; only an approved table counts.
 */
export function TableSection({
  vehicleId,
  vm,
  offer,
  newTable,
  onApproved,
}: {
  vehicleId: string;
  vm: ServiceTableVM | null;
  /** The transcribed Ford Fiesta 2012 table can be offered. */
  offer: boolean;
  /** Opened to type a new table (from the profile window). */
  newTable?: boolean;
  onApproved: () => void;
}) {
  const { saveServiceTable, removeServiceTable } = useAppData();
  const imp = useTableImport(vehicleId);
  const [editing, setEditing] = useState(false);
  const [cell, setCell] = useState<{ rowId: string; column: number } | null>(null);
  const [row, setRow] = useState<string | 'new' | null>(null);
  const [shape, setShape] = useState(Boolean(newTable && !vm));
  const [discard, setDiscard] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const [unverified, setUnverified] = useState(false);

  const save = (table: ServiceTable, unsure: string[], status = vm?.status ?? 'proposed') =>
    saveServiceTable(vehicleId, {
      table,
      status,
      source: vm?.source ?? 'manual',
      documentId: vm?.documentId ?? null,
      unsure,
    });

  const reading = imp.state.kind === 'reading' ? imp.state : null;
  const progress = reading ? (
    <StatusCard
      testID="table-reading"
      tone="info"
      icon="clock-outline"
      title={t.reading(reading.page, reading.pages)}
      subtitle={t.readingHint}
    />
  ) : imp.state.kind === 'pages' ? (
    <Card testID="table-pages" tone="tint">
      <Stack gap={spacing.sm}>
        <AppText variant="bodyStrong">{t.pagesTaken(imp.state.count)}</AppText>
        <Button
          testID="table-read-pages"
          label={t.readPages}
          icon="text-recognition"
          fullWidth
          onPress={() => void imp.readPages()}
        />
        <Button
          testID="table-add-page"
          label={t.addPage}
          icon="camera-plus-outline"
          variant="secondary"
          fullWidth
          onPress={() => void imp.start('camera')}
        />
      </Stack>
    </Card>
  ) : imp.state.kind === 'failed' ? (
    <InlineNotice
      testID="table-read-failed"
      tone="warning"
      message={t.readFailed[imp.state.reason]}
      action={{ label: he.common.close, icon: 'close', onPress: imp.dismiss }}
    />
  ) : null;

  const shapeSheet = (
    <ShapeSheet
      visible={shape}
      onClose={() => setShape(false)}
      onCreate={(s) => {
        setShape(false);
        saveServiceTable(vehicleId, {
          table: { ...s, rows: [], footnotes: [] },
          status: 'proposed',
          source: 'manual',
          documentId: null,
          unsure: [],
        });
        setRow('new');
      }}
    />
  );

  if (!vm) {
    return (
      <Stack gap={spacing.md}>
        {progress}
        <Card testID="table-empty">
          <Stack gap={spacing.sm}>
            <AppText variant="heading">{t.empty.title}</AppText>
            <AppText color="textSecondary">{t.empty.body}</AppText>
            {offer ? (
              <Stack gap={spacing.xs}>
                <Button
                  testID="table-offer"
                  label={t.offer}
                  icon="book-open-variant"
                  fullWidth
                  onPress={() =>
                    saveServiceTable(vehicleId, {
                      table: FIESTA_2012_TABLE,
                      status: 'proposed',
                      source: 'transcribed',
                      documentId: null,
                      unsure: [],
                    })
                  }
                />
                <AppText variant="caption" color="textSecondary">
                  {t.offerHint}
                </AppText>
              </Stack>
            ) : null}
            {imp.available ? (
              <>
                <Button
                  testID="table-photo"
                  label={t.photo}
                  icon="camera-outline"
                  variant={offer ? 'secondary' : 'primary'}
                  fullWidth
                  disabled={Boolean(reading) || imp.state.kind === 'pages'}
                  onPress={() => void imp.start('camera')}
                />
                <Button
                  testID="table-file"
                  label={t.file}
                  icon="file-upload-outline"
                  variant="secondary"
                  fullWidth
                  disabled={Boolean(reading)}
                  onPress={() => void imp.start('file')}
                />
              </>
            ) : null}
            <Button
              testID="table-manual"
              label={t.manual}
              icon="table-edit"
              variant="secondary"
              fullWidth
              onPress={() => setShape(true)}
            />
            {imp.available ? (
              <AppText variant="caption" color="textSecondary" testID="table-privacy">
                {`${t.photoTip} ${t.privacy}`}
              </AppText>
            ) : null}
          </Stack>
        </Card>
        {shapeSheet}
      </Stack>
    );
  }

  const { table, unsure } = vm;
  const proposed = vm.status === 'proposed';
  const editable = proposed || editing;
  const without = (keys: string[]) => unsure.filter((u) => !keys.includes(u));

  const saveCell = (actions: TableAction[], wholeRow: boolean) => {
    if (!cell) return;
    const cols = wholeRow ? Array.from({ length: table.columns }, (_, i) => i) : [cell.column];
    save(
      {
        ...table,
        rows: table.rows.map((r) =>
          r.id === cell.rowId && r.cells
            ? { ...r, cells: r.cells.map((c, i) => (cols.includes(i) ? actions : c)) }
            : r,
        ),
      },
      without(cols.map((c) => `${cell.rowId}:${c}`)),
    );
    setCell(null);
  };

  const saveRow = (next: ServiceTableRow, refilled: boolean) => {
    const exists = table.rows.some((r) => r.id === next.id);
    let rows: ServiceTableRow[];
    if (exists) rows = table.rows.map((r) => (r.id === next.id ? next : r));
    else {
      // A new row joins the end of its heading's rows (or the end of the table).
      const lastOfGroup = next.group ? table.rows.map((r) => r.group).lastIndexOf(next.group) : -1;
      rows =
        lastOfGroup >= 0
          ? [...table.rows.slice(0, lastOfGroup + 1), next, ...table.rows.slice(lastOfGroup + 1)]
          : [...table.rows, next];
    }
    const cellKeys = Array.from({ length: table.columns }, (_, i) => `${next.id}:${i}`);
    // The row's own flag is answered; its cells too when they were all set again (or are gone).
    save({ ...table, rows }, without([next.id, ...(refilled || !next.cells ? cellKeys : [])]));
    setRow(null);
  };

  const approve = () => {
    // Every cell must be verified first: nothing uncertain from the reading may count.
    if (unsure.length) {
      setIncomplete(false);
      setUnverified(true);
      return;
    }
    setUnverified(false);
    if (tableIssues(table).length) {
      setIncomplete(true);
      return;
    }
    setIncomplete(false);
    save(table, [], 'confirmed');
    onApproved();
  };

  return (
    <Stack gap={spacing.md}>
      {progress}
      {proposed ? (
        <StatusCard
          testID="table-proposed"
          tone="warning"
          icon="clipboard-check-outline"
          title={t.proposedTitle}
          subtitle={vm.source === 'transcribed' ? t.transcribedBody : t.proposedBody(unsure.length)}
        />
      ) : (
        <AppText variant="caption" color="textSecondary" testID="table-source">
          {t.source[vm.source]}
        </AppText>
      )}
      <TableGrid
        table={table}
        unsure={unsure}
        onCellPress={editable ? (rowId, column) => setCell({ rowId, column }) : undefined}
        onRowPress={editable ? setRow : undefined}
      />
      {unverified && unsure.length ? (
        <InlineNotice
          testID="table-unverified"
          tone="warning"
          message={t.unverified(unsure.length)}
        />
      ) : null}
      {incomplete ? (
        <InlineNotice testID="table-incomplete" tone="warning" message={t.incomplete} />
      ) : null}
      {editable ? (
        <Button
          testID="table-add-row"
          label={t.addRow}
          icon="plus"
          variant="secondary"
          fullWidth
          onPress={() => setRow('new')}
        />
      ) : null}
      {proposed ? (
        <Button testID="table-approve" label={t.confirm} icon="check" fullWidth onPress={approve} />
      ) : (
        <Button
          testID="table-edit"
          label={editing ? t.editDone : t.edit}
          icon={editing ? 'check' : 'pencil-outline'}
          variant={editing ? 'primary' : 'secondary'}
          fullWidth
          onPress={() => setEditing((e) => !e)}
        />
      )}
      <Button
        testID="table-discard"
        label={proposed ? t.discard : t.replace}
        icon="delete-outline"
        variant="ghost"
        fullWidth
        onPress={() => setDiscard(true)}
      />

      <CellSheet table={table} target={cell} onSave={saveCell} onClose={() => setCell(null)} />
      <RowSheet
        table={table}
        rowId={row}
        onSave={saveRow}
        onDelete={(id) => {
          save(
            { ...table, rows: table.rows.filter((r) => r.id !== id) },
            unsure.filter((u) => u !== id && !u.startsWith(`${id}:`)),
          );
          setRow(null);
        }}
        onClose={() => setRow(null)}
      />
      <Dialog
        testID="table-discard-dialog"
        visible={discard}
        title={t.discardTitle}
        message={t.discardBody}
        confirmLabel={t.discard}
        cancelLabel={he.common.cancel}
        destructive
        onConfirm={() => {
          setDiscard(false);
          setEditing(false);
          removeServiceTable(vehicleId);
        }}
        onCancel={() => setDiscard(false)}
      />
      {shapeSheet}
    </Stack>
  );
}
