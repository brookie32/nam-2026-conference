import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { AskChat } from '../components/AskChat.jsx';
import { SectionHeader } from '../components/ui.jsx';

export { renderReply } from '../components/AskChat.jsx';

export function AskPage() {
  useDocumentTitle('Ask ORBIT');
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Ask the programme"
        title="Ask ORBIT"
        description="Ask about sessions, speakers, venues and getting between them. Answers come from the programme and link to the sessions they name."
      />
      <AskChat />
    </div>
  );
}
