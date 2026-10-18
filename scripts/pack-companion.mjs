import {execFileSync} from 'node:child_process'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const root=new URL('../',import.meta.url),out=new URL('artifacts/',root)
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()
if(git('status','--porcelain','--untracked-files=normal'))throw Error('Commit all source and documentation before packaging')
const commit=git('rev-parse','HEAD'),manifest=JSON.parse(await readFile(new URL('companion/package.json',root),'utf8'))
await mkdir(out,{recursive:true})
const [packed]=JSON.parse(execFileSync('npm',['pack','./companion','--ignore-scripts','--json','--pack-destination',out.pathname],{cwd:root,encoding:'utf8'}))
if(JSON.stringify(packed.files.map(f=>f.path).sort())!==JSON.stringify(['package.json',...manifest.files].sort()))throw Error('Unexpected companion archive members')
if(git('status','--porcelain','--untracked-files=normal')||git('rev-parse','HEAD')!==commit)throw Error('Source changed while packaging')
const sha256=createHash('sha256').update(await readFile(new URL(packed.filename,out))).digest('hex')
const release={name:manifest.name,version:manifest.version,commit,filename:packed.filename,sha256}
await writeFile(new URL('COMPANION-SHA256SUMS',out),`${sha256}  ${packed.filename}\n`)
await writeFile(new URL('companion-release.json',out),JSON.stringify(release,null,2)+'\n')
console.log(JSON.stringify(release))
