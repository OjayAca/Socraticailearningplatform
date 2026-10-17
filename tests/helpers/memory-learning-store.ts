import { ServiceError, type RecordDoc, type Store } from "../../server/platform";
// In-memory unit fixtures only. Never seed or connect a Firebase project.
export class MemoryStore implements Store {
  records = new Map<string,{data:any;version:number}>();
  put(path:string,data:any) {this.records.set(path,{data:structuredClone(data),version:(this.records.get(path)?.version??0)+1});}
  async get(path:string):Promise<RecordDoc> {const r=this.records.get(path);return{path,data:r?structuredClone(r.data):null,version:r?String(r.version):undefined};}
  async query(collection:string,field?:string,value?:unknown) {return Promise.all([...this.records].filter(([path,r])=>path.startsWith(collection+"/") && path.split("/").length===collection.split("/").length+1 && (!field||r.data[field]===value)).map(([path])=>this.get(path)));}
  async commit(writes:Array<{doc:RecordDoc;data:any}>) {
    for(const {doc} of writes) if(String(this.records.get(doc.path)?.version??"")!==(doc.version??"")) throw new ServiceError(409,"conflict","Stale document");
    for(const {doc,data} of writes)this.put(doc.path,data);
  }
}
