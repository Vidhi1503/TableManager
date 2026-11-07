import { Component, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  CellClickedEvent,
  ColDef,
  GetRowIdParams,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ModuleRegistry,
} from 'ag-grid-community';
import { DbErrorRow, ErrorService } from '../../services/error.service';

ModuleRegistry.registerModules([AllCommunityModule]);

// erstatus ka matlab (sir se confirm karna). Galat ho toh yahin badlo
const STATUS: Record<number, string> = {
  0: 'Unresolved',
  1: 'Resolved',
};

type FilterKey = 'client' | 'db' | 'status';

interface Option {
  value: string;
  label: string;
}

interface FilterDef {
  key: FilterKey;
  title: string;
  prefix?: string;
  options: Option[];
}

const parseDb = (s: string) => new Date(s.replace(' ', 'T'));

@Component({
  selector: 'app-error-table',
  imports: [AgGridAngular, FormsModule, DecimalPipe],
  templateUrl: './error-table.html',
  styleUrl: './error-table.css',
})
export class ErrorTable {
  private errorService = inject(ErrorService);
  private gridApi!: GridApi;
  private reqId = 0;
  private searchTimer: any;

  // Ek page me kitni rows
  readonly pageSize = 20;

  readonly page = signal(1);
  readonly total = signal(0);
  readonly rows = signal<DbErrorRow[]>([]);
  readonly loading = signal(false);
  readonly errorMsg = signal('');
  readonly search = signal('');
  readonly selected = signal<DbErrorRow | null>(null);
  readonly openMenu = signal<FilterKey | null>(null);

  // Dropdown ki list API se aati hai
  readonly clientList = signal<string[]>([]);
  readonly dbList = signal<string[]>([]);

  // Dropdown ki chuni hui values ('' matlab koi filter nahi)
  readonly values = signal<Record<FilterKey, string>>({
    client: '',
    db: '',
    status: '',
  });

  // Date ke 2 box ('yyyy-mm-dd')
  readonly fromDate = signal('');
  readonly toDate = signal('');

  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  readonly from = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize + 1
  );
  readonly to = computed(() => Math.min(this.page() * this.pageSize, this.total()));

  // Koi bhi filter ya search laga hai ya nahi
  readonly hasFilters = computed(
    () =>
      !!this.search().trim() ||
      Object.values(this.values()).some((v) => v !== '') ||
      !!this.fromDate() ||
      !!this.toDate()
  );

  // Row aur header ki height
  rowHeight = window.innerWidth < 768 ? 44 : 50;
  headerHeight = window.innerWidth < 768 ? 40 : 53;

  readonly filterDefs = computed<FilterDef[]>(() => [
    {
      key: 'client',
      title: 'Client',
      options: [
        { value: '', label: 'All clients' },
        ...this.clientList().map((c) => ({ value: c, label: c })),
      ],
    },
    {
      key: 'db',
      title: 'Database',
      options: [
        { value: '', label: 'All databases' },
        ...this.dbList().map((d) => ({ value: d, label: d })),
      ],
    },
    {
      key: 'status',
      title: 'Status',
      prefix: 'Status: ',
      options: [
        { value: '', label: 'All status' },
        ...Object.entries(STATUS).map(([v, label]) => ({ value: v, label })),
      ],
    },
  ]);

  constructor() {
    this.load();
    this.loadFilters();
  }

  // ================= SERVICE SE DATA LANA =================
  async load() {
    const id = ++this.reqId;
    this.loading.set(true);
    this.errorMsg.set('');

    const v = this.values();

    try {
      const res = await firstValueFrom(
        this.errorService.getErrors({
          page: this.page(),
          pageSize: this.pageSize,
          search: this.search().trim(),
          client: v.client,
          db: v.db,
          status: v.status,
          from: this.fromDate(),
          to: this.toDate(),
        })
      );
      if (id !== this.reqId) return; // purana jawab, ignore
      this.rows.set(res.items);
      this.total.set(res.total);
    } catch (err: any) {
      if (id !== this.reqId) return;
      this.rows.set([]);
      this.total.set(0);

      const code = err?.status;
      if (code === 0) {
        this.errorMsg.set('API se baat nahi ho pa rahi. API chal rahi hai? (port aur CORS check karo)');
      } else if (code === 401) {
        this.errorMsg.set('401: API ko token chahiye.');
      } else if (code === 404) {
        this.errorMsg.set('404: endpoint nahi mila. API dobara chalao aur URL check karo.');
      } else if (code) {
        this.errorMsg.set(`Data load nahi hua (error ${code}).`);
      } else {
        this.errorMsg.set(err?.message ?? 'Data load nahi hua.');
      }
    } finally {
      if (id === this.reqId) this.loading.set(false);
    }
  }

  async loadFilters() {
    try {
      const res = await firstValueFrom(this.errorService.getFilters());
      this.clientList.set(res.clients ?? []);
      this.dbList.set(res.databases ?? []);
    } catch {
      // list nahi mili toh dropdown me sirf "All" dikhega
    }
  }

  // Refresh button
  refresh() {
    this.load();
    this.loadFilters();
  }

  // ================= SEARCH, FILTER, PAGE =================
  onSearch(value: string) {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 400);
  }

  isActive(f: FilterDef): boolean {
    return this.values()[f.key] !== '';
  }

  textFor(f: FilterDef): string {
    const v = this.values()[f.key];
    if (v === '') return f.title;
    const label = f.options.find((o) => o.value === v)?.label ?? f.title;
    return (f.prefix ?? '') + label;
  }

  toggleMenu(key: FilterKey) {
    this.openMenu.update((v) => (v === key ? null : key));
  }

  pick(key: FilterKey, value: string) {
    this.values.update((v) => ({ ...v, [key]: value }));
    this.openMenu.set(null);
    this.page.set(1);
    this.load();
  }

  setDate(kind: 'from' | 'to', value: string) {
    if (kind === 'from') this.fromDate.set(value ?? '');
    else this.toDate.set(value ?? '');
    this.page.set(1);
    this.load();
  }

  clearFilters() {
    this.search.set('');
    this.values.set({ client: '', db: '', status: '' });
    this.fromDate.set('');
    this.toDate.set('');
    this.page.set(1);
    this.load();
  }

  goTo(p: number) {
    const next = Math.min(Math.max(1, p), this.pages());
    if (next === this.page()) return;
    this.page.set(next);
    this.load();
  }

  // ================= HELPERS =================
  statusLabel(v: number): string {
    return STATUS[v] ?? String(v);
  }

  fmt(s: string): string {
    if (!s) return '';
    const d = parseDb(s);
    return isNaN(d.getTime())
      ? s
      : d.toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
  }

  // ================= TABLE =================
  readonly defaultColDef: ColDef = {
    sortable: false,
    resizable: false,
    cellStyle: { display: 'flex', alignItems: 'center', fontSize: '13px' },
  };

  readonly columnDefs: ColDef<DbErrorRow>[] = [
    { field: 'eid', headerName: 'Error ID', flex: 80, minWidth: 70 },
    {
      field: 'cname',
      headerName: 'Client',
      flex: 120,
      minWidth: 95,
      valueFormatter: (p) => p.value || '—',
    },
    { field: 'dbname', headerName: 'Database', flex: 160, minWidth: 130 },
    {
      field: 'dtime',
      headerName: 'Date and time',
      flex: 150,
      minWidth: 150,
      valueFormatter: (p) => this.fmt(p.value),
    },
    {
      field: 'erresponse',
      headerName: 'Error response',
      flex: 260,
      minWidth: 170,
      tooltipField: 'erresponse',
    },
        {
      field: 'swid',
      headerName: 'Software ID',
      flex: 100,
      minWidth: 100,
      valueFormatter: (p) => p.value || '—',
    },
    {
      field: 'linkid',
      headerName: 'Link ID',
      flex: 80,
      minWidth: 80,
      valueFormatter: (p) => p.value || '—',
    },
    {
      field: 'erstatus',
      headerName: 'Status',
      flex: 110,
      minWidth: 100,
      cellRenderer: (p: any) => {
        const label = this.statusLabel(p.value);
        return `<span class="badge badge-${label.toLowerCase()}">${label}</span>`;
      },
    },
    {
      colId: 'actions',
      headerName: 'Actions',
      width: 90,
      type: 'rightAligned',
      cellRenderer: () =>
        `<span class="act-btn">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
             <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
           </svg>
         </span>`,
    },
  ];

  readonly gridOptions: GridOptions = {
    suppressCellFocus: true,
    suppressMovableColumns: true,
  };

  getRowId = (p: GetRowIdParams<DbErrorRow>) => String(p.data.eid);

  onGridReady(e: GridReadyEvent) {
    this.gridApi = e.api;
    this.adjustForScreen();
  }

  onGridSizeChanged() {
    this.adjustForScreen();
  }

  // Mobile par Database, Date, Error response chhupao aur rows chhoti karo
  private adjustForScreen() {
    if (!this.gridApi) return;
    const small = window.innerWidth < 768;
    this.gridApi.setColumnsVisible(['dbname', 'dtime', 'erresponse'], !small);
    this.gridApi.setColumnWidths([{ key: 'actions', newWidth: small ? 60 : 90 }]);
    this.gridApi.setGridOption('rowHeight', small ? 44 : 50);
    this.gridApi.setGridOption('headerHeight', small ? 40 : 53);
    this.gridApi.resetRowHeights();
  }

  onCellClicked(e: CellClickedEvent<DbErrorRow>) {
    if (e.colDef.colId === 'actions' && e.data) {
      this.selected.set(e.data);
    }
  }

  // Export: abhi sirf is page ki rows. Poore data ka export backend se hona chahiye
  exportCsv() {
    this.gridApi.exportDataAsCsv({
      fileName: 'errors-page-' + this.page() + '.csv',
      columnKeys: ['eid', 'cname', 'dbname', 'dtime', 'erresponse', 'erstatus'],
    });
  }

  // ================= DETAILS SHEET =================
  closeSheet() {
    this.selected.set(null);
  }

  // API me status badalne wala endpoint abhi nahi bana
  async markResolved() {
    const e = this.selected();
    if (!e) return;
    try {
      await firstValueFrom(this.errorService.updateStatus(e.eid, 1));
      this.rows.update((list) =>
        list.map((r) => (r.eid === e.eid ? { ...r, erstatus: 1 } : r))
      );
      this.selected.set({ ...e, erstatus: 1 });
    } catch {
      alert('Status update nahi hua. API me status badalne wala endpoint abhi nahi hai.');
    }
  }
}