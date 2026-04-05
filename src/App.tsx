import { Webview } from "./components/webview";

const App = () => {
  const updateTitle = (id: string, title: string) => {
    console.log(`Tab ${id} title updated: ${title}`);
  }
  const updateUrl = (id: string, url: string) => {
    console.log(`Tab ${id} URL updated: ${url}`);
  }
  const closeTab = (id: string | null, tabId: string) => {
    console.log(`Close tab ${tabId}`);
  }
  return (
    <div className="relative w-full h-full flex items-center justify-center bg-app-background">
      <Webview
        url="https://game.aq.com/game/"
        onTitleUpdate={updateTitle}
        onUrlChanged={updateUrl}
        onClose={(id) => closeTab(null, id)}
      />
    </div>
  );
};

export default App;
