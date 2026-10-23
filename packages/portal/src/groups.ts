import {portalEmail, portalId, PORTAL_LIMITS} from './index.ts';

export type StudyGroup = Readonly<{id:string;revision:string;title:string;description:string;kind:'group'|'private';facilitatorId:string}>;
export type StudySession = Readonly<{id:string;revision:string;groupId:string;title:string;description:string;startsAt:string;durationMinutes:number}>;
export type GroupPost = Readonly<{id:string;groupId:string;authorId:string;authorRole:'learner'|'admin';body:string;createdAt:string}>;
export type GroupInvitation = Readonly<{id:string;groupId:string;email:string;expiresAt:string;status:'pending'|'accepted'|'revoked'}>;
export type GroupMember = Readonly<{userId:string;email:string}>;
export type TeacherRequestInput = Readonly<{subject:string;message:string}>;
export type TeacherRequest = Readonly<{id:string;learnerId:string;subject:string;message:string;status:'open'|'assigned';roomId?:string}>;
export interface GroupWorkspace {
  listGroups():Promise<readonly StudyGroup[]>;
  saveGroup(group:StudyGroup,expectedRevision:string|null):Promise<StudyGroup>;
  listSessions(groupId:string):Promise<readonly StudySession[]>;
  saveSession(session:StudySession,expectedRevision:string|null):Promise<StudySession>;
  listPosts(groupId:string):Promise<readonly GroupPost[]>;
  addPost(groupId:string,body:string):Promise<void>;
  removePost(groupId:string,postId:string):Promise<void>;
  listInvitations(groupId:string):Promise<readonly GroupInvitation[]>;
  inviteLearner(groupId:string,email:string):Promise<GroupInvitation>;
  revokeInvitation(groupId:string,id:string):Promise<void>;
  acceptInvitation(token:string):Promise<StudyGroup>;
  listMembers(groupId:string):Promise<readonly GroupMember[]>;
  removeMember(groupId:string,userId:string):Promise<void>;
  listTeacherRequests():Promise<readonly TeacherRequest[]>;
  requestTeacher(request:TeacherRequestInput):Promise<void>;
  createPrivateRoom(requestId:string,title:string,description:string):Promise<StudyGroup>;
}
export const GROUP_LIMITS=Object.freeze({groups:50,sessions:100,posts:100,invitations:100,members:100,requests:100,title:160,description:2000,postBody:2000,requestMessage:2000});
function fail():never{throw new Error('Invalid or oversized group record.');}
function row(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return fail();
  const result=value as Record<string,unknown>;
  if(required.some(key=>!Object.hasOwn(result,key))||Object.keys(result).some(key=>!required.includes(key)&&!optional.includes(key)))return fail();
  return result;
}
function text(value:unknown,max:number,required=false):string{
  // oxlint-disable-next-line no-control-regex -- Preserve readable multiline text while rejecting control characters.
  if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))return fail();
  return value;
}
export function groupInstant(value:unknown):string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value))return fail();
  const time=new Date(value);
  if(!Number.isFinite(time.getTime())||time.toISOString().slice(0,19)!==value.slice(0,19))return fail();
  return time.toISOString();
}
export function validateStudyGroup(value:unknown):StudyGroup{
  const v=row(value,['id','revision','title','description','kind','facilitatorId']);
  if(v.kind!=='group'&&v.kind!=='private')return fail();
  return Object.freeze({id:portalId(v.id),revision:portalId(v.revision),title:text(v.title,GROUP_LIMITS.title,true),description:text(v.description,GROUP_LIMITS.description),kind:v.kind,facilitatorId:portalId(v.facilitatorId)});
}
export function validateStudySession(value:unknown):StudySession{
  const v=row(value,['id','revision','groupId','title','description','startsAt','durationMinutes']);
  if(!Number.isSafeInteger(v.durationMinutes)||(v.durationMinutes as number)<1||(v.durationMinutes as number)>1440)return fail();
  return Object.freeze({id:portalId(v.id),revision:portalId(v.revision),groupId:portalId(v.groupId),title:text(v.title,GROUP_LIMITS.title,true),description:text(v.description,GROUP_LIMITS.description),startsAt:groupInstant(v.startsAt),durationMinutes:v.durationMinutes as number});
}
export function validateGroupPostBody(value:unknown):string{return text(value,GROUP_LIMITS.postBody,true);}
export function validateGroupPost(value:unknown):GroupPost{
  const v=row(value,['id','groupId','authorId','authorRole','body','createdAt']);
  if(v.authorRole!=='learner'&&v.authorRole!=='admin')return fail();
  return Object.freeze({id:portalId(v.id),groupId:portalId(v.groupId),authorId:portalId(v.authorId),authorRole:v.authorRole,body:validateGroupPostBody(v.body),createdAt:groupInstant(v.createdAt)});
}
export function validateGroupInvitation(value:unknown):GroupInvitation{
  const v=row(value,['id','groupId','email','expiresAt','status']);
  if(v.status!=='pending'&&v.status!=='accepted'&&v.status!=='revoked')return fail();
  return Object.freeze({id:portalId(v.id),groupId:portalId(v.groupId),email:portalEmail(v.email),expiresAt:groupInstant(v.expiresAt),status:v.status});
}
export function validateGroupMember(value:unknown):GroupMember{
  const v=row(value,['userId','email']);return Object.freeze({userId:portalId(v.userId),email:portalEmail(v.email)});
}
export function validateTeacherRequestInput(value:unknown):TeacherRequestInput{
  const v=row(value,['subject','message']);return Object.freeze({subject:text(v.subject,GROUP_LIMITS.title,true),message:text(v.message,GROUP_LIMITS.requestMessage,true)});
}
export function validateTeacherRequest(value:unknown):TeacherRequest{
  const v=row(value,['id','learnerId','subject','message','status'],['roomId']);
  if(v.status!=='open'&&v.status!=='assigned')return fail();
  if((v.status==='assigned')!==Object.hasOwn(v,'roomId'))return fail();
  const request=validateTeacherRequestInput({subject:v.subject,message:v.message});
  return Object.freeze({id:portalId(v.id),learnerId:portalId(v.learnerId),...request,status:v.status,...('roomId'in v?{roomId:portalId(v.roomId)}:{})});
}
function list<T>(value:unknown,maximum:number,validate:(row:unknown)=>T,key:(row:T)=>string):readonly T[]{
  if(!Array.isArray(value)||value.length>maximum)return fail();
  const rows=value.map(validate);
  if(new Set(rows.map(key)).size!==rows.length||new TextEncoder().encode(JSON.stringify(rows)).byteLength>PORTAL_LIMITS.responseBytes)return fail();
  return Object.freeze(rows);
}
export function validateStudyGroupList(value:unknown):readonly StudyGroup[]{return list(value,GROUP_LIMITS.groups,validateStudyGroup,v=>v.id);}
export function validateStudySessionList(value:unknown):readonly StudySession[]{return list(value,GROUP_LIMITS.sessions,validateStudySession,v=>v.id);}
export function validateGroupPostList(value:unknown):readonly GroupPost[]{return list(value,GROUP_LIMITS.posts,validateGroupPost,v=>v.id);}
export function validateGroupInvitationList(value:unknown):readonly GroupInvitation[]{return list(value,GROUP_LIMITS.invitations,validateGroupInvitation,v=>v.id);}
export function validateGroupMemberList(value:unknown):readonly GroupMember[]{return list(value,GROUP_LIMITS.members,validateGroupMember,v=>v.userId);}
export function validateTeacherRequestList(value:unknown):readonly TeacherRequest[]{return list(value,GROUP_LIMITS.requests,validateTeacherRequest,v=>v.id);}
