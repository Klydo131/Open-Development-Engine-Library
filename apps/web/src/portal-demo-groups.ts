import {GROUP_LIMITS, PortalConflict, portalEmail, portalId, validateGroupInvitation, validateGroupInvitationList, validateGroupMemberList, validateGroupPostBody, validateGroupPostList, validateStudyGroup, validateStudyGroupList, validateStudySession, validateStudySessionList, validateTeacherRequestInput, validateTeacherRequestList, type GroupInvitation, type GroupMember, type GroupPost, type GroupWorkspace, type PortalUser, type StudyGroup, type StudySession, type TeacherRequest} from '../../../packages/portal/src/index.ts';

export function createDemoGroups(user:()=>PortalUser,options:{learnerId:string;adminId:string;now?:()=>number}){
  const now=options.now??Date.now;
  const seed=validateStudyGroup({id:crypto.randomUUID(),revision:crypto.randomUUID(),title:'Learning together',description:'Share a question, practice together and plan your next study session.',kind:'group',facilitatorId:options.adminId});
  const groups:StudyGroup[]=[seed];
  const sessions:StudySession[]=[validateStudySession({id:crypto.randomUUID(),revision:crypto.randomUUID(),groupId:seed.id,title:'A question and a small experiment',description:'Bring an observation or a question from your reading.',startsAt:new Date(now()+86400000).toISOString(),durationMinutes:30})];
  const posts:GroupPost[]=[];
  const invitations:GroupInvitation[]=[];
  const tokens=new Map<string,string>();
  const members=new Map<string,GroupMember[]>([[seed.id,[{userId:options.learnerId,email:'learner@example.invalid'}]]]);
  const requests:TeacherRequest[]=[];
  const requestEmails=new Map<string,string>();
  const denied=():never=>{throw new Error('This group is unavailable for this account.');};
  function group(id:string):StudyGroup{
    const account=user(),value=groups.find(v=>v.id===portalId(id));
    if(!value)return denied();
    const allowed=account.role==='admin'?(value.kind==='group'||value.facilitatorId===account.id):(members.get(value.id)??[]).some(v=>v.userId===account.id);
    if(!allowed)return denied();
    return value;
  }
  function adminGroup(id:string):StudyGroup{if(user().role!=='admin')return denied();return group(id);}
  function admin(){const account=user();if(account.role!=='admin')return denied();return account;}
  function revision(existing:{revision:string}|undefined,expected:string|null){const checked=expected===null?null:portalId(expected);if(existing?existing.revision!==checked:checked!==null)throw new PortalConflict();}
  function capacity(length:number,maximum:number){if(length>=maximum)throw new Error('This demonstration has reached its record limit.');}
  const workspace:GroupWorkspace={
    async listGroups(){const account=user();return validateStudyGroupList(groups.filter(v=>account.role==='admin'?(v.kind==='group'||v.facilitatorId===account.id):(members.get(v.id)??[]).some(m=>m.userId===account.id)));},
    async saveGroup(input,expectedRevision){
      const account=admin(),checked=validateStudyGroup(input),existing=groups.find(v=>v.id===checked.id);
      if(existing){adminGroup(existing.id);if(existing.kind!==checked.kind||existing.facilitatorId!==checked.facilitatorId)return denied();}
      else{if(checked.kind!=='group'||checked.facilitatorId!==account.id)return denied();capacity(groups.length,GROUP_LIMITS.groups);}
      revision(existing,expectedRevision);
      const next=validateStudyGroup({...checked,revision:crypto.randomUUID()});
      if(existing)groups.splice(groups.indexOf(existing),1,next);else groups.push(next);
      return next;
    },
    async listSessions(groupId){const value=group(groupId);return validateStudySessionList(sessions.filter(v=>v.groupId===value.id));},
    async saveSession(input,expectedRevision){
      const checked=validateStudySession(input);adminGroup(checked.groupId);
      const existing=sessions.find(v=>v.id===checked.id);
      if(existing&&existing.groupId!==checked.groupId)return denied();
      revision(existing,expectedRevision);
      if(!existing)capacity(sessions.filter(v=>v.groupId===checked.groupId).length,GROUP_LIMITS.sessions);
      const next=validateStudySession({...checked,revision:crypto.randomUUID()});
      if(existing)sessions.splice(sessions.indexOf(existing),1,next);else sessions.push(next);
      return next;
    },
    async listPosts(groupId){const value=group(groupId);return validateGroupPostList(posts.filter(v=>v.groupId===value.id));},
    async addPost(groupId,body){
      const value=group(groupId),account=user(),checked=validateGroupPostBody(body);
      capacity(posts.filter(v=>v.groupId===value.id).length,GROUP_LIMITS.posts);
      posts.push({id:crypto.randomUUID(),groupId:value.id,authorId:account.id,authorRole:account.role,body:checked,createdAt:new Date(now()).toISOString()});
    },
    async removePost(groupId,postId){
      const value=group(groupId),account=user(),post=posts.find(v=>v.id===portalId(postId)&&v.groupId===value.id);
      if(!post||account.role!=='admin'&&post.authorId!==account.id)return denied();
      posts.splice(posts.indexOf(post),1);
    },
    async listInvitations(groupId){const value=adminGroup(groupId);return validateGroupInvitationList(invitations.filter(v=>v.groupId===value.id));},
    async inviteLearner(groupId,email){
      const value=adminGroup(groupId),checked=portalEmail(email).toLowerCase();
      if(value.kind==='private')return denied();
      capacity(invitations.filter(v=>v.groupId===value.id).length,GROUP_LIMITS.invitations);
      if(invitations.some(v=>v.groupId===value.id&&v.email===checked&&v.status==='pending'&&Date.parse(v.expiresAt)>now()))throw new Error('A pending invitation already exists for this email.');
      const invitation=validateGroupInvitation({id:crypto.randomUUID(),groupId:value.id,email:checked,expiresAt:new Date(now()+7*86400000).toISOString(),status:'pending'});
      invitations.push(invitation);tokens.set(invitation.id,Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join(''));return invitation;
    },
    async revokeInvitation(groupId,id){
      const value=adminGroup(groupId),invitation=invitations.find(v=>v.id===portalId(id)&&v.groupId===value.id);
      if(!invitation||invitation.status!=='pending')return denied();
      invitations.splice(invitations.indexOf(invitation),1,{...invitation,status:'revoked'});tokens.delete(invitation.id);
    },
    async acceptInvitation(token){
      const account=user();
      if(account.role!=='learner'||typeof token!=='string'||!/^[a-f0-9]{64}$/u.test(token))return denied();
      const entry=[...tokens].find(([,value])=>value===token),invitation=entry&&invitations.find(v=>v.id===entry[0]);
      if(!invitation||invitation.status!=='pending'||Date.parse(invitation.expiresAt)<=now()||invitation.email!==account.email.toLowerCase())return denied();
      const value=groups.find(v=>v.id===invitation.groupId);
      if(!value||value.kind!=='group')return denied();
      const roster=members.get(value.id)??[];
      if(!roster.some(v=>v.userId===account.id)){capacity(roster.length,GROUP_LIMITS.members);members.set(value.id,[...roster,{userId:account.id,email:account.email}]);}
      invitations.splice(invitations.indexOf(invitation),1,{...invitation,status:'accepted'});tokens.delete(invitation.id);
      return validateStudyGroup(value);
    },
    async listMembers(groupId){const value=adminGroup(groupId);return validateGroupMemberList(members.get(value.id)??[]);},
    async removeMember(groupId,userId){const value=adminGroup(groupId),id=portalId(userId);members.set(value.id,(members.get(value.id)??[]).filter(v=>v.userId!==id));},
    async listTeacherRequests(){
      const account=user();
      return validateTeacherRequestList(requests.filter(v=>account.role==='learner'?v.learnerId===account.id:v.status==='open'||groups.some(g=>g.id===v.roomId&&g.facilitatorId===account.id)));
    },
    async requestTeacher(input){
      const account=user();if(account.role!=='learner')return denied();
      const checked=validateTeacherRequestInput(input);capacity(requests.length,GROUP_LIMITS.requests);
      const id=crypto.randomUUID();requests.push({id,learnerId:account.id,...checked,status:'open'});requestEmails.set(id,account.email);
    },
    async createPrivateRoom(requestId,title,description){
      const account=admin(),request=requests.find(v=>v.id===portalId(requestId)&&v.status==='open');
      if(!request)return denied();capacity(groups.length,GROUP_LIMITS.groups);
      const value=validateStudyGroup({id:crypto.randomUUID(),revision:crypto.randomUUID(),title,description,kind:'private',facilitatorId:account.id});
      groups.push(value);members.set(value.id,[{userId:request.learnerId,email:requestEmails.get(request.id)!}]);
      requests.splice(requests.indexOf(request),1,{...request,status:'assigned',roomId:value.id});return value;
    },
  };
  return {workspace,previewInvitation(id:string):Readonly<{email:string;token:string}>{
    admin();const invitation=invitations.find(v=>v.id===portalId(id));
    if(!invitation)return denied();adminGroup(invitation.groupId);
    const token=tokens.get(invitation.id);if(!token)return denied();
    return Object.freeze({email:invitation.email,token});
  }};
}
