import './style.css';

export const dynamic = 'force-dynamic';
export const metadata = {title:'ProofDock'};
export const viewport = {colorScheme:'dark',themeColor:'#272727'};

export default function Layout({children}) {
  return <html lang="zh-CN" style={{backgroundColor:'#272727',colorScheme:'dark'}}><body style={{backgroundColor:'#272727',color:'#f2f2f2'}}>{children}</body></html>;
}
