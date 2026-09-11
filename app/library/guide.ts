import {
  LIBRARY_CLASSIFICATION_HINTS,
  LIBRARY_CLASSIFICATION_LABELS,
  LIBRARY_DOCUMENT_TYPE_LABELS,
  LIBRARY_ROLE_CLEARANCE,
} from '@/server/modules/library/types';

export type LibraryGuideLink = {
  readonly href: string;
  readonly label: string;
};

export type LibraryGuideSection = {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
  readonly links?: readonly LibraryGuideLink[];
};

export const LIBRARY_GUIDE_HREF = '/library/help';

/** Short jumps used on the dashboard and settings so a new person can pick a topic. */
export const LIBRARY_GUIDE_QUICK_LINKS: readonly LibraryGuideLink[] = [
  { href: `${LIBRARY_GUIDE_HREF}#what-it-is`, label: 'What Library is' },
  { href: `${LIBRARY_GUIDE_HREF}#search`, label: 'Search' },
  { href: `${LIBRARY_GUIDE_HREF}#access-levels`, label: 'Access levels' },
  { href: `${LIBRARY_GUIDE_HREF}#locked-files`, label: 'Locked files' },
  { href: `${LIBRARY_GUIDE_HREF}#upload`, label: 'Uploading' },
  { href: `${LIBRARY_GUIDE_HREF}#comments`, label: 'Comments' },
  { href: `${LIBRARY_GUIDE_HREF}#sharing`, label: 'Sharing' },
  { href: `${LIBRARY_GUIDE_HREF}#collections`, label: 'Collections' },
];

export const LIBRARY_GUIDE_SECTIONS: readonly LibraryGuideSection[] = [
  {
    id: 'what-it-is',
    title: 'What Skyjet Library is',
    paragraphs: [
      'Skyjet Library is the document cupboard for this organisation. It holds aircraft-spares manuals, certificates, inspection files, technical records and other company documents that must stay with the organisation, not on a shared drive or in email.',
      'It is a separate product from Skyjet Business Suite. The same login and the same organisation open both, but Library files are not mixed with invoices, bills or other Business Suite attachments. Choose Skyjet Library on the workspace after you sign in.',
      'The purpose is simple: find the right controlled file, see whether you are allowed to open it, and leave a trail when someone does. Clearance is enforced in the database, not only on the screen.',
    ],
    links: [
      { href: '/workspace', label: 'Back to workspace' },
      { href: '/library', label: 'Open the dashboard' },
    ],
  },
  {
    id: 'who-it-is-for',
    title: 'Who it is for',
    paragraphs: [
      'Anyone in the organisation who needs technical documents uses Library. A warehouse picker looking up a certificate, a purchaser checking a CMM, and an owner reviewing who opened a restricted file all use the same catalogue.',
      'What you can open depends on your role, not on whether you can see the title. Titles of files above your clearance still appear so you know the document exists. The file itself stays locked until a manager grants that one document.',
    ],
  },
  {
    id: 'getting-in',
    title: 'How you get in',
    paragraphs: [
      'Sign in with your Skyjet account. If the organisation is entitled to Library, the workspace shows Skyjet Library beside Skyjet Business Suite. Open Library. You can return to the workspace at any time with Switch workspace.',
      'If you belong to more than one organisation, pick the organisation first. Documents never cross organisations.',
    ],
    links: [{ href: '/workspace', label: 'Open the workspace' }],
  },
  {
    id: 'dashboard',
    title: 'The dashboard',
    paragraphs: [
      'The dashboard is the front door. It shows how many active documents are on the shelf, how much storage you can open, how many scans still need OCR, and how many collections exist.',
      'Bars by category and access level jump into the matching list. Recent uploads are at the bottom. Click a category tile to browse that type. Nothing on this screen posts to the ledger; it is a glance at the catalogue.',
    ],
    links: [{ href: '/library', label: 'Open the dashboard' }],
  },
  {
    id: 'search',
    title: 'Finding a file',
    paragraphs: [
      'Use the search bar at the top, or press Ctrl+K (⌘K on a Mac). You can also press / when you are not typing in a field. Search looks at titles, part numbers, manufacturers, tags and extracted text inside the file when that text exists.',
      'The Documents page has filters for category, status, access level and tag. In the search box you can type filters as well as words.',
    ],
    bullets: [
      'Words and "quoted phrases" search the catalogue.',
      'type:manuals or category:cert limits the category.',
      'level:confidential or class:restricted limits the access level.',
      'status:ARCHIVED shows archived cards. Active is the default on the list.',
      'tag:amm and part:CFM56-7B match a tag or part number.',
    ],
    links: [
      { href: '/library/documents', label: 'Open documents' },
      { href: `${LIBRARY_GUIDE_HREF}#ocr`, label: 'How search reads scans' },
    ],
  },
  {
    id: 'categories',
    title: 'Categories',
    paragraphs: [
      'Every file belongs to one category. Categories describe what the document is, not which pile you keep it in. Collections can mix categories; the category on the file does not change.',
    ],
    bullets: Object.values(LIBRARY_DOCUMENT_TYPE_LABELS),
    links: [{ href: '/library/documents', label: 'Browse documents' }],
  },
  {
    id: 'opening-a-file',
    title: 'Opening a document',
    paragraphs: [
      "Open a row to see the catalogue card: preview (PDF and images), grouped details, who uploaded it, and when. Click the uploader's name for a workplace card (name, email and job title — not a phone number, and not the People admin page). Anyone who can open the file can see that card.",
      'If you can open the file you can preview it in the browser, download it, comment on it, and share it. Downloads and opens are recorded.',
      'Preview is for PDFs and pictures. Other types, such as Word, Excel or zip, are stored and downloaded; they do not preview in the page.',
    ],
    links: [{ href: '/library/documents', label: 'Find a document' }],
  },
  {
    id: 'access-levels',
    title: 'Access levels',
    paragraphs: [
      'Every file has an access level. The level is enforced when you try to open or download, not only when the list is drawn. Requesting access to one file does not change your role or raise your clearance for other files.',
    ],
    bullets: [
      `${LIBRARY_CLASSIFICATION_LABELS.internal}: ${LIBRARY_CLASSIFICATION_HINTS.internal}`,
      `${LIBRARY_CLASSIFICATION_LABELS.confidential}: ${LIBRARY_CLASSIFICATION_HINTS.confidential}`,
      `${LIBRARY_CLASSIFICATION_LABELS.restricted}: ${LIBRARY_CLASSIFICATION_HINTS.restricted}`,
      ...LIBRARY_ROLE_CLEARANCE.map((row) => `${row.roles}: ${row.access}. ${row.audit}.`),
    ],
    links: [
      { href: `${LIBRARY_GUIDE_HREF}#locked-files`, label: 'What to do when a file is locked' },
    ],
  },
  {
    id: 'locked-files',
    title: 'Locked files and asking for access',
    paragraphs: [
      'A locked card still shows the title, category and access level. The file name and the bytes are hidden. You can send a request with an optional reason. That does not raise your role. A manager can grant or refuse that one document.',
      'Managers see pending requests on the document. When they decide, you get a notice on the bell. If a request was refused you can ask again if the need has changed.',
    ],
    links: [{ href: '/library/documents', label: 'See the catalogue' }],
  },
  {
    id: 'notifications',
    title: 'The bell',
    paragraphs: [
      'The bell in the top bar is for Library notices: someone asked to open a file you can grant, a manager approved or refused your request, a colleague shared a file with you, or someone commented on a file you uploaded or already commented on. Open a notice to go to the document. Unread counts sit on the bell.',
      'A comment does not notify everyone who has ever opened the file. That would be noise, and opening a file is not the same as joining a thread.',
    ],
  },
  {
    id: 'upload',
    title: 'Uploading a file',
    paragraphs: [
      'People who may upload use Upload on the dashboard, the documents list, or the sidebar. Choose the file, check the title (it is filled from the file name), pick a category and an access level you yourself are allowed to assign, then add aircraft, part, manufacturer, revision and tags if you have them.',
      'Accepted types include PDF, images, Word, Excel, text, CSV and zip. The file must be between 1 byte and 32 MB. Files stay in Skyjet Library storage. If the same bytes are already in the catalogue, you are told before a second card is created.',
    ],
    links: [{ href: '/library/documents/new', label: 'Upload a document' }],
  },
  {
    id: 'revisions',
    title: 'Revisions',
    paragraphs: [
      'Replacing a file does not throw the old one away. Use Replace file on the document to open a dialog, then choose or drop the new file. Each stored file is a revision. The current revision is what preview and download use. A manager can restore an earlier revision. The catalogue card keeps the same identity; only the stored file changes.',
    ],
  },
  {
    id: 'comments',
    title: 'Comments and review',
    paragraphs: [
      'If you can open a document you can comment on it. Open Comments on the document page. The thread is a dialog: read notes, add one, and react (agree, looks good, seen, needs attention).',
      'The bell tells the person who uploaded the file and people who already commented. It does not tell every past viewer. The notice does not include the comment text; open the file to read the thread. Locked files have no comments until you can open them.',
    ],
    links: [{ href: '/library/documents', label: 'Find a document' }],
  },
  {
    id: 'sharing',
    title: 'Sharing a file',
    paragraphs: [
      'If you can open a document you can share it. Open Share on the document page. You can notify a colleague in Library, email them a sign-in link, copy the Library link, or open WhatsApp with that link. The file itself is never attached to email or WhatsApp.',
      'The named colleague gets a notice in the Library bell. Copying a link does not ring the bell, because you have not named who will open it. Sharing does not change anyone’s role. If they cannot open the file, a manager share can grant that one document; a viewer share only notifies them so they can request access.',
      'The share trail on the document records who shared, when, how, and with whom. Notes on a share stay on that trail. They are not copied into the bell notice.',
    ],
    links: [{ href: '/library/documents', label: 'Find a document' }],
  },
  {
    id: 'ocr',
    title: 'Searchable text and OCR',
    paragraphs: [
      'Search can read words inside a PDF or text file when the file has a text layer. Scans and pictures often do not. Those are queued for OCR so later searches can find words on the page. The dashboard counts files that still need OCR.',
      'On a document, you will see whether text came from the file, from OCR, or whether OCR is still running, failed, or found nothing. People who may manage or upload can run OCR again on a scan.',
    ],
    links: [{ href: '/library', label: 'See the OCR count on the dashboard' }],
  },
  {
    id: 'collections',
    title: 'Collections',
    paragraphs: [
      'A collection is a named pile that can mix manuals, certificates and other types. Use one when people actually keep mixed files together — a job pack, an aircraft folder, a delivery set. Categories still classify each file. If you do not need a pile, browse by category instead.',
      'People who may manage documents can create, rename and delete collections, and add or remove files from a document’s Collections card.',
    ],
    links: [{ href: '/library/collections', label: 'Open collections' }],
  },
  {
    id: 'links',
    title: 'Linking a file to a part, person or supplier',
    paragraphs: [
      'A document can be linked to an item, a user, an employee or a supplier that already exists in Skyjet. That does not move the file into Business Suite. It only records that this catalogue card belongs with that record. Managers add and remove those links on the document.',
    ],
  },
  {
    id: 'settings',
    title: 'Settings, people and the access log',
    paragraphs: [
      'Everyone can open their profile: name, job title, phone and password. Switch workspace is also on the account menu on smaller screens.',
      'People who manage the organisation can edit the company name, address and logo — the same directory as the rest of Skyjet. People who manage users invite colleagues and assign the role that sets Library clearance. Owners, super admins and managers can read the access log: who opened or downloaded which file, and when.',
    ],
    links: [
      { href: '/library/settings', label: 'Open settings' },
      { href: '/library/settings/profile', label: 'Your profile' },
    ],
  },
  {
    id: 'phones',
    title: 'Phones and tablets',
    paragraphs: [
      'On a phone or tablet the sidebar sits behind the menu button. Search, the bell and your profile stay in the top bar. Long tables scroll sideways. Upload and edit forms use the full width. The desktop layout is unchanged on a wide screen.',
    ],
  },
  {
    id: 'what-it-will-not-do',
    title: 'What Library will not do',
    paragraphs: [
      'Library does not post to the general ledger, issue invoices, or replace Business Suite. It does not grant a new role when you request a file. Sharing does not email the file bytes, and a copied link is not a public download. It does not preview every file type. It does not search words inside a scan until OCR has finished, and it will not invent text when OCR finds none.',
      'If a file is not in the catalogue, it is not in Skyjet Library. Put it here if the organisation must keep it.',
    ],
    links: [{ href: '/library', label: 'Return to the dashboard' }],
  },
];
