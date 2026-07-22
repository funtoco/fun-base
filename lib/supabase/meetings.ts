import { createClient } from './client'
import type { Meeting, MeetingNote } from '@/lib/models'
import { getAccessiblePersonIdsForCurrentUser } from './people-access'

export async function getMeetings(): Promise<Meeting[]> {
  const supabase = createClient()
  const accessiblePersonIds = await getAccessiblePersonIdsForCurrentUser(supabase, 'meetings')

  if (accessiblePersonIds.length === 0) {
    return []
  }
  
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      meeting_notes (
        id,
        section,
        item,
        level,
        detail
      )
    `)
    .in('person_id', accessiblePersonIds)
    .order('datetime', { ascending: false })
  
  if (error) {
    console.error('Error fetching meetings:', error)
    throw error
  }
  
  // SupabaseのデータをMeeting型に変換
  return data.map((meeting: any) => ({
    id: meeting.id,
    personId: meeting.person_id,
    kind: meeting.kind,
    title: meeting.title,
    datetime: meeting.datetime,
    durationMin: meeting.duration_min,
    attendees: meeting.attendees,
    createdBy: meeting.created_by,
    notes: meeting.meeting_notes.map((note: any) => ({
      section: note.section,
      item: note.item,
      level: note.level,
      detail: note.detail
    })) as MeetingNote[],
    createdAt: meeting.created_at,
    updatedAt: meeting.updated_at
  }))
}

export async function getMeetingById(id: string): Promise<Meeting | null> {
  const supabase = createClient()
  const accessiblePersonIds = await getAccessiblePersonIdsForCurrentUser(supabase, 'meetings')

  if (accessiblePersonIds.length === 0) {
    return null
  }
  
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      meeting_notes (
        id,
        section,
        item,
        level,
        detail
      )
    `)
    .eq('id', id)
    .in('person_id', accessiblePersonIds)
    .single()
  
  if (error) {
    console.error('Error fetching meeting:', error)
    return null
  }
  
  return {
    id: data.id,
    personId: data.person_id,
    kind: data.kind,
    title: data.title,
    datetime: data.datetime,
    durationMin: data.duration_min,
    attendees: data.attendees,
    createdBy: data.created_by,
    notes: data.meeting_notes.map((note: any) => ({
      section: note.section,
      item: note.item,
      level: note.level,
      detail: note.detail
    })) as MeetingNote[],
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

export async function getMeetingsByPersonId(personId: string): Promise<Meeting[]> {
  const supabase = createClient()
  const accessiblePersonIds = await getAccessiblePersonIdsForCurrentUser(supabase, 'meetings')

  if (!accessiblePersonIds.includes(personId)) {
    return []
  }
  
  const { data, error } = await supabase
    .from('meetings')
    .select(`
      *,
      meeting_notes (
        id,
        section,
        item,
        level,
        detail
      )
    `)
    .eq('person_id', personId)
    .order('datetime', { ascending: false })
  
  if (error) {
    console.error('Error fetching meetings by person ID:', error)
    throw error
  }
  
  return data.map((meeting: any) => ({
    id: meeting.id,
    personId: meeting.person_id,
    kind: meeting.kind,
    title: meeting.title,
    datetime: meeting.datetime,
    durationMin: meeting.duration_min,
    attendees: meeting.attendees,
    createdBy: meeting.created_by,
    notes: meeting.meeting_notes.map((note: any) => ({
      section: note.section,
      item: note.item,
      level: note.level,
      detail: note.detail
    })) as MeetingNote[],
    createdAt: meeting.created_at,
    updatedAt: meeting.updated_at
  }))
}

export async function createMeeting(meeting: Omit<Meeting, 'createdAt' | 'updatedAt'>): Promise<Meeting> {
  const supabase = createClient()
  
  // まずmeetingを作成
  const { data: meetingData, error: meetingError } = await supabase
    .from('meetings')
    .insert({
      id: meeting.id,
      person_id: meeting.personId,
      kind: meeting.kind,
      title: meeting.title,
      datetime: meeting.datetime,
      duration_min: meeting.durationMin,
      attendees: meeting.attendees,
      created_by: meeting.createdBy
    })
    .select()
    .single()
  
  if (meetingError) {
    console.error('Error creating meeting:', meetingError)
    throw meetingError
  }
  
  // 次にnotesを作成
  if (meeting.notes && meeting.notes.length > 0) {
    const notesData = meeting.notes.map(note => ({
      meeting_id: meeting.id,
      section: note.section,
      item: note.item,
      level: note.level,
      detail: note.detail
    }))
    
    const { error: notesError } = await supabase
      .from('meeting_notes')
      .insert(notesData)
    
    if (notesError) {
      console.error('Error creating meeting notes:', notesError)
      throw notesError
    }
  }
  
  // 作成されたmeetingを取得して返す
  const createdMeeting = await getMeetingById(meeting.id)
  if (!createdMeeting) {
    throw new Error('Failed to retrieve created meeting')
  }
  
  return createdMeeting
}

export async function updateMeeting(id: string, updates: Partial<Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Meeting> {
  const supabase = createClient()
  
  // meetingを更新
  const { data: meetingData, error: meetingError } = await supabase
    .from('meetings')
    .update({
      person_id: updates.personId,
      kind: updates.kind,
      title: updates.title,
      datetime: updates.datetime,
      duration_min: updates.durationMin,
      attendees: updates.attendees,
      created_by: updates.createdBy
    })
    .eq('id', id)
    .select()
    .single()
  
  if (meetingError) {
    console.error('Error updating meeting:', meetingError)
    throw meetingError
  }
  
  // notesを更新（既存のnotesを削除して新しく挿入）
  if (updates.notes !== undefined) {
    // 既存のnotesを削除
    const { error: deleteError } = await supabase
      .from('meeting_notes')
      .delete()
      .eq('meeting_id', id)
    
    if (deleteError) {
      console.error('Error deleting meeting notes:', deleteError)
      throw deleteError
    }
    
    // 新しいnotesを挿入
    if (updates.notes.length > 0) {
      const notesData = updates.notes.map(note => ({
        meeting_id: id,
        section: note.section,
        item: note.item,
        level: note.level,
        detail: note.detail
      }))
      
      const { error: notesError } = await supabase
        .from('meeting_notes')
        .insert(notesData)
      
      if (notesError) {
        console.error('Error creating meeting notes:', notesError)
        throw notesError
      }
    }
  }
  
  // 更新されたmeetingを取得して返す
  const updatedMeeting = await getMeetingById(id)
  if (!updatedMeeting) {
    throw new Error('Failed to retrieve updated meeting')
  }
  
  return updatedMeeting
}

export async function deleteMeeting(id: string): Promise<void> {
  const supabase = createClient()
  
  // meetingを削除（notesは外部キー制約により自動削除される）
  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting meeting:', error)
    throw error
  }
}
