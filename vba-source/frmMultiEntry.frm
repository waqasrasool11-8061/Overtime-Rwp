VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A4F} frmMultiEntry 
   Caption         =   "L-2 ENTRY FORM"
   ClientHeight    =   7545
   ClientLeft      =   120
   ClientTop       =   468
   ClientWidth     =   15360
   OleObjectBlob   =   "frmMultiEntry.frx":0000
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "frmMultiEntry"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Private Sub btnCancel_Click()
    ' Clear all form fields without saving
    txtStartDate.Value = ""
    txtEndDate.Value = ""
    cmbEmp1.Value = ""
    cmbEmp2.Value = ""
    cmbDutyType.Value = ""
    txtOT.Value = ""
    txtMileage.Value = ""
    txtRemarks.Value = ""

End Sub
Private Sub btnSubmit_Click()
    Dim wsOut As Worksheet
    Set wsOut = ThisWorkbook.Sheets("RawData")

    ' Date Variables
    Dim startDate As Date, endDate As Date
    Dim arr1() As String, arr2() As String

    ' Parse Start Date
    If Not IsDate(txtStartDate.Value) Then
        MsgBox "Invalid Start Date", vbCritical: Exit Sub
    End If
    arr1 = Split(txtStartDate.Text, "/")
    startDate = DateSerial(arr1(2), arr1(1), arr1(0))

    ' Parse End Date
    If Not IsDate(txtEndDate.Value) Then
        MsgBox "Invalid End Date", vbCritical: Exit Sub
    End If
    arr2 = Split(txtEndDate.Text, "/")
    endDate = DateSerial(arr2(2), arr2(1), arr2(0))

    ' Check Dates
    If endDate < startDate Then
        MsgBox "End Date must be after Start Date", vbExclamation: Exit Sub
    End If

    ' Required Fields
    If cmbEmp1.Value = "" Or cmbDutyType.Value = "" Then
        MsgBox "Employee 1 and Duty Type are required", vbExclamation: Exit Sub
    End If

    ' === OT Conversion (UNCHANGED) ===
    Dim rawOT As String
    Dim h As Long, m As Long
    Dim otTime As Double

    rawOT = Trim(txtOT.Value)

    If rawOT = "" Then
        h = 0: m = 0
    ElseIf InStr(rawOT, ":") > 0 Then
        Dim p() As String
        p = Split(rawOT, ":")
        If UBound(p) = 1 And IsNumeric(p(0)) And IsNumeric(p(1)) Then
            h = CLng(p(0)): m = CLng(p(1))
        Else
            MsgBox "Invalid OT format (expected hh:mm or hhmm)", vbExclamation
            Exit Sub
        End If
    ElseIf IsNumeric(rawOT) Then
        Select Case Len(rawOT)
            Case 1, 2
                h = 0: m = CLng(rawOT)
            Case Is >= 3
                h = CLng(Left(rawOT, Len(rawOT) - 2))
                m = CLng(Right(rawOT, 2))
        End Select
    Else
        MsgBox "Invalid OT entry", vbExclamation
        Exit Sub
    End If

    If m >= 60 Then
        h = h + (m \ 60)
        m = m Mod 60
    End If

    otTime = (h + (m / 60#)) / 24#

    ' Mileage
    Dim mileage As Double
    If IsNumeric(txtMileage.Value) Then
        mileage = txtMileage.Value
    Else
        mileage = 0
    End If

    ' Start Row
    Dim RowOut As Long
    RowOut = Application.Max(3, wsOut.Cells(wsOut.Rows.count, 1).End(xlUp).row + 1)

    ' === BASIC DATE RANGE LOOP (UNCHANGED) ===
    Dim i As Long
    Dim remarkParts() As String
    Dim firstRemark As String, secondRemark As String
    Dim currentRow As Long

    For i = 0 To DateDiff("d", startDate, endDate)
        currentRow = RowOut + i

        wsOut.Cells(currentRow, 1).Value = startDate + i
        wsOut.Cells(currentRow, 2).Value = cmbEmp1.Value
        wsOut.Cells(currentRow, 3).Value = cmbEmp2.Value
        wsOut.Cells(currentRow, 4).Value = cmbDutyType.Value

        If i = 0 Then
            If Trim(Me.txtOT.Value) <> "" Then
                wsOut.Cells(currentRow, 5).Value = otTime
                wsOut.Cells(currentRow, 5).NumberFormat = "[h]:mm"
            Else
                wsOut.Cells(currentRow, 5).ClearContents
            End If

            If Trim(Me.txtMileage.Value) <> "" Then
                wsOut.Cells(currentRow, 6).Value = mileage
            Else
                wsOut.Cells(currentRow, 6).ClearContents
            End If

            firstRemark = "": secondRemark = ""
            If Trim(Me.txtRemarks.Value) <> "" Then
                If InStr(Me.txtRemarks.Value, ",") > 0 Then
                    remarkParts = Split(Me.txtRemarks.Value, ",")
                    firstRemark = Trim(remarkParts(0))
                    If UBound(remarkParts) >= 1 Then secondRemark = Trim(remarkParts(1))
                Else
                    firstRemark = Trim(Me.txtRemarks.Value)
                End If
            End If

            If startDate = endDate Then
                If secondRemark <> "" Then
                    wsOut.Cells(currentRow, 13).Value = firstRemark & ", " & secondRemark
                Else
                    wsOut.Cells(currentRow, 13).Value = firstRemark
                End If
            Else
                wsOut.Cells(currentRow, 13).Value = firstRemark
                If secondRemark <> "" Then
                    wsOut.Cells(RowOut + DateDiff("d", startDate, endDate), 13).Value = secondRemark
                End If
            End If
        Else
            wsOut.Cells(currentRow, 5).ClearContents
            wsOut.Cells(currentRow, 6).ClearContents
        End If
    Next i

    ' ============================================
    ' === FINAL PERFECT OUTWARD/INWARD LOGIC ====
    ' ============================================

    ' Parse journey times FIRST
    Dim outComm As Date, outTerm As Date, inComm As Date, inTerm As Date
    If Not TryParseClock24(Me.txtOutStart.Value, outComm, "Outward Commenced") Then Exit Sub
    If Trim(Me.txtOutEnd.Value) <> "" And Not TryParseClock24(Me.txtOutEnd.Value, outTerm, "Outward Terminated") Then Exit Sub
    If Trim(Me.txtInStart.Value) <> "" And Not TryParseClock24(Me.txtInStart.Value, inComm, "Inward Commenced") Then Exit Sub
    If Trim(Me.txtInEnd.Value) <> "" And Not TryParseClock24(Me.txtInEnd.Value, inTerm, "Inward Terminated") Then Exit Sub

    ' === NIGHT DUTY RULE: End < Start ? +1 EXTRA row ===
    Dim outNightShift As Long, inNightShift As Long
    outNightShift = 0: inNightShift = 0
    If Trim(Me.txtOutEnd.Value) <> "" And outTerm < outComm Then outNightShift = 1
    If Trim(Me.txtInEnd.Value) <> "" And inTerm < inComm Then inNightShift = 1

    ' Parse Duration Fields
    Dim outDurationDays As Long, inDurationDays As Long
    If Trim(Me.txtOutDuration.Value) <> "" Then
        If IsNumeric(Me.txtOutDuration.Value) And CLng(Me.txtOutDuration.Value) >= 0 Then
            outDurationDays = CLng(Me.txtOutDuration.Value)
        Else
            MsgBox "Out Duration must be numeric (0,1,2...)", vbExclamation: Exit Sub
        End If
    Else
        outDurationDays = 0
    End If

    If Trim(Me.txtInDuration.Value) <> "" Then
        If IsNumeric(Me.txtInDuration.Value) And CLng(Me.txtInDuration.Value) >= 0 Then
            inDurationDays = CLng(Me.txtInDuration.Value)
        Else
            MsgBox "In Duration must be numeric (0,1,2...)", vbExclamation: Exit Sub
        End If
    Else
        inDurationDays = 0
    End If

    ' === PERFECT ROW CALCULATION ===
    Dim outTermRow As Long, inCommRow As Long, inTermRow As Long
    outTermRow = RowOut + outDurationDays + outNightShift       ' OutEnd row
    If inComm >= outTerm Then
        inCommRow = outTermRow                                ' SAME ROW (InStart >= OutEnd)
    Else
        inCommRow = outTermRow + 1                            ' NEXT ROW (InStart < OutEnd)
    End If
    inTermRow = inCommRow + inDurationDays + inNightShift       ' InEnd row

    ' ===== OUTWARD SAVE (G:H:I) =====
    If Trim(Me.txtOutDuty.Value) <> "" Then
        wsOut.Cells(RowOut, 7).Value = Me.txtOutDuty.Value
    End If
    If Trim(Me.txtOutStart.Value) <> "" Then
        wsOut.Cells(RowOut, 8).Value = Format(outComm, "hh:mm")
        wsOut.Cells(RowOut, 8).NumberFormat = "hh:mm"
    End If
    If Trim(Me.txtOutEnd.Value) <> "" Then
        wsOut.Cells(outTermRow, 9).Value = Format(outTerm, "hh:mm")
        wsOut.Cells(outTermRow, 9).NumberFormat = "hh:mm"
    End If

    ' ===== INWARD SAVE (J:K:L) =====
    If Trim(Me.txtInDuty.Value) <> "" Then
        wsOut.Cells(inCommRow, 10).Value = Me.txtInDuty.Value
    End If
    If Trim(Me.txtInStart.Value) <> "" Then
        wsOut.Cells(inCommRow, 11).Value = Format(inComm, "hh:mm")
        wsOut.Cells(inCommRow, 11).NumberFormat = "hh:mm"
    End If
    If Trim(Me.txtInEnd.Value) <> "" Then
        wsOut.Cells(inTermRow, 12).Value = Format(inTerm, "hh:mm")
        wsOut.Cells(inTermRow, 12).NumberFormat = "hh:mm"
    End If

    Call FormatRawDataNewRows
    MsgBox "? Entries saved successfully!", vbInformation
    Call ClearFields
End Sub

Private Function ParseTimeFromText(timeText As String) As Date
    Dim h As Integer, m As Integer
    
    timeText = Trim(timeText)
    If timeText = "" Then
        ParseTimeFromText = 0
        Exit Function
    End If
    
    If InStr(timeText, ":") > 0 Then
        ParseTimeFromText = CDate(timeText)
    ElseIf IsNumeric(timeText) Then
        Select Case Len(timeText)
            Case 1, 2
                h = 0
                m = CInt(timeText)
            Case Else
                h = CInt(Left(timeText, Len(timeText) - 2))
                m = CInt(Right(timeText, 2))
        End Select
        
        If m >= 60 Then
            h = h + (m \ 60)
            m = m Mod 60
        End If
        
        ParseTimeFromText = TimeSerial(h, m, 0)
    Else
        ParseTimeFromText = 0
    End If
End Function

Private Sub cmbEmp2_Change()

End Sub

Private Sub lblEmp1_Click()

End Sub

Private Sub lblEndDate_Click()

End Sub

Private Sub lblOT_Click()

End Sub


Private Sub lblOutDuration_Click()

End Sub

Private Sub lblRemarks_Click()

End Sub

Private Sub lblStartDate_Click()

End Sub

Private Sub txtEndDate_Change()

End Sub

Private Sub txtEndDate_Error(ByVal Number As Integer, ByVal Description As MSForms.ReturnString, ByVal SCode As Long, ByVal Source As String, ByVal HelpFile As String, ByVal HelpContext As Long, ByVal CancelDisplay As MSForms.ReturnBoolean)

End Sub

Private Sub txtEndDate_Exit(ByVal Cancel As MSForms.ReturnBoolean)
    Dim rawDate As String
    rawDate = Replace(Me.txtEndDate.Value, "/", "")

    If IsNumeric(rawDate) And Len(rawDate) = 8 Then
        Dim d As String, mth As String, y As String
        d = Left(rawDate, 2)
        mth = Mid(rawDate, 3, 2)
        y = Right(rawDate, 4)
        Me.txtEndDate.Value = d & "/" & mth & "/" & y
    End If
End Sub

Private Sub txtMileage_Change()

End Sub

' === OT auto-format in textbox (UNLIMITED HOURS, no TimeSerial wrapping) ===
Private Sub txtOT_AfterUpdate()
    Dim v As String, h As Long, m As Long

    v = Trim(Me.txtOT.Value)
    If v = "" Then Exit Sub

    If InStr(v, ":") > 0 Then
        Dim p() As String
        p = Split(v, ":")
        If UBound(p) = 1 And IsNumeric(p(0)) And IsNumeric(p(1)) Then
            h = CLng(p(0)): m = CLng(p(1))
        Else
            MsgBox "Invalid OT entry. Use hh:mm or hhmm", vbExclamation
            Me.txtOT.Value = "": Exit Sub
        End If
    ElseIf IsNumeric(v) Then
        Select Case Len(v)
            Case 1, 2
                h = 0: m = CLng(v)
            Case Is >= 3
                h = CLng(Left(v, Len(v) - 2))
                m = CLng(Right(v, 2))
        End Select
    Else
        MsgBox "Invalid OT entry. Use hh:mm or hhmm", vbExclamation
        Me.txtOT.Value = "": Exit Sub
    End If

    ' Normalize minutes (e.g., 3560 -> 36:00)
    If m >= 60 Then
        h = h + (m \ 60)
        m = m Mod 60
    End If

    Me.txtOT.Value = Format(h, "00") & ":" & Format(m, "00")
End Sub
' -------------------------
' Auto-format duty time boxes (Out/In start & end)
' -------------------------
Private Sub txtOutStart_AfterUpdate()
    Dim t As Date
    If Trim(Me.txtOutStart.Value) = "" Then Exit Sub
    If Not TryParseClock24(Me.txtOutStart.Value, t, "Outward Commenced") Then
        Me.txtOutStart.Value = ""
        Exit Sub
    End If
    Me.txtOutStart.Value = Format(t, "hh:mm")
End Sub

Private Sub txtOutEnd_AfterUpdate()
    Dim t As Date
    If Trim(Me.txtOutEnd.Value) = "" Then Exit Sub
    If Not TryParseClock24(Me.txtOutEnd.Value, t, "Outward Terminated") Then
        Me.txtOutEnd.Value = ""
        Exit Sub
    End If
    Me.txtOutEnd.Value = Format(t, "hh:mm")
End Sub

Private Sub txtInStart_AfterUpdate()
    Dim t As Date
    If Trim(Me.txtInStart.Value) = "" Then Exit Sub
    If Not TryParseClock24(Me.txtInStart.Value, t, "Inward Commenced") Then
        Me.txtInStart.Value = ""
        Exit Sub
    End If
    Me.txtInStart.Value = Format(t, "hh:mm")
End Sub

Private Sub txtInEnd_AfterUpdate()
    Dim t As Date
    If Trim(Me.txtInEnd.Value) = "" Then Exit Sub
    If Not TryParseClock24(Me.txtInEnd.Value, t, "Inward Terminated") Then
        Me.txtInEnd.Value = ""
        Exit Sub
    End If
    Me.txtInEnd.Value = Format(t, "hh:mm")
End Sub



Private Sub txtOT_Change()

End Sub

Private Sub txtOT_Enter()

End Sub


Private Sub txtStartDate_Change()

End Sub

Private Sub txtStartDate_Exit(ByVal Cancel As MSForms.ReturnBoolean)
    Dim rawDate As String
    rawDate = Replace(Me.txtStartDate.Value, "/", "")

    If IsNumeric(rawDate) And Len(rawDate) = 8 Then
        Dim d As String, mth As String, y As String
        d = Left(rawDate, 2)
        mth = Mid(rawDate, 3, 2)
        y = Right(rawDate, 4)
        Me.txtStartDate.Value = d & "/" & mth & "/" & y
    End If
End Sub

Private Sub UserForm_Initialize()
    Dim wsEmp As Worksheet
    Dim lastRow As Long, i As Long
    Dim valList As String, item As Variant

    Set wsEmp = ThisWorkbook.Sheets("Employee_Master")
    lastRow = wsEmp.Cells(wsEmp.Rows.count, 2).End(xlUp).row

    cmbEmp1.Clear
    cmbEmp2.Clear
    For i = 2 To lastRow
        If wsEmp.Cells(i, 2).Value <> "" Then
            cmbEmp1.AddItem wsEmp.Cells(i, 2).Value
            cmbEmp2.AddItem wsEmp.Cells(i, 2).Value
        End If
    Next i

    On Error Resume Next
    valList = wsEmp.Parent.Sheets("MultiDateEntry").Range("E2").Validation.Formula1
    valList = Replace(valList, "=", "")
    On Error GoTo 0

    If InStr(valList, ",") > 0 Then
        cmbDutyType.Clear
        For Each item In Split(valList, ",")
            cmbDutyType.AddItem Trim(item)
        Next item
    End If

    cmbEmp1.MatchEntry = fmMatchEntryNone
    cmbEmp2.MatchEntry = fmMatchEntryNone
    ' Clear new duration fields
txtOutDuration.Value = ""
txtInDuration.Value = ""
End Sub


' === KeyUp Events for Dynamic Typing ===
Private Sub cmbEmp1_KeyUp(ByVal KeyCode As MSForms.ReturnInteger, ByVal Shift As Integer)
    Select Case KeyCode
        Case 13, 38, 40 ' Enter / Up / Down
            Exit Sub
        Case Else
            DynamicFilterStartsWith_Safe cmbEmp1
    End Select
End Sub

Private Sub cmbEmp2_KeyUp(ByVal KeyCode As MSForms.ReturnInteger, ByVal Shift As Integer)
    If cmbEmp2.Value = cmbEmp1.Value And cmbEmp2.Value <> "" Then
        MsgBox "Employee 2 cannot be the same as Employee 1.", vbExclamation
        cmbEmp2.Value = ""
        Exit Sub
    End If

    Select Case KeyCode
        Case 13, 38, 40
            Exit Sub
        Case Else
            DynamicFilterStartsWith_Safe cmbEmp2
    End Select
End Sub

Private Sub cmbEmp2_AfterUpdate()
    If Trim(cmbEmp2.Value) <> "" Then
        If StrComp(cmbEmp2.Value, cmbEmp1.Value, vbTextCompare) = 0 Then
            MsgBox "Employee 2 cannot be the same as Employee 1.", vbExclamation
            cmbEmp2.Value = ""
        End If
    End If
End Sub

' === Dynamic Filter for ComboBoxes ===
Private Sub DynamicFilterStartsWith_Safe(cmb As MSForms.ComboBox)
    Dim ws As Worksheet, lastRow As Long, i As Long
    Dim txt As String, val As String
    Dim matchList As Collection

    Set ws = ThisWorkbook.Sheets("Employee_Master")
    lastRow = ws.Cells(ws.Rows.count, 2).End(xlUp).row
    txt = LCase(cmb.Text) ' include spaces
    Set matchList = New Collection

    Application.EnableEvents = False
    cmb.Clear

    If txt = "" Then
        ' Show all employees if nothing typed
        For i = 2 To lastRow
            val = ws.Cells(i, 2).Value
            If val <> "" Then cmb.AddItem val
        Next i
    Else
        ' Show only names starting with typed sequence (spaces included)
        For i = 2 To lastRow
            val = ws.Cells(i, 2).Value
            If LCase(Left(val, Len(txt))) = txt Then
                matchList.Add val
            End If
        Next i

        ' Populate ComboBox
        For i = 1 To matchList.count
            cmb.AddItem matchList(i)
        Next i
    End If

    ' Restore typed text and cursor position
    cmb.Text = txt
    cmb.SelStart = Len(txt)
    If txt <> "" Then cmb.DropDown ' force dropdown open

    Application.EnableEvents = True
End Sub


' === Time Parsing Helper (existing) ===
Private Function TryParseClock24(ByVal txt As String, ByRef t As Date, ByVal fieldName As String) As Boolean
    Dim s As String, h As Long, m As Long, p() As String
    s = Trim(txt)
    If s = "" Then
        t = 0
        TryParseClock24 = True
        Exit Function
    End If

    If InStr(s, ":") > 0 Then
        p = Split(s, ":")
        If UBound(p) <> 1 Or Not IsNumeric(p(0)) Or Not IsNumeric(p(1)) Then GoTo Bad
        h = CLng(p(0)): m = CLng(p(1))
    ElseIf IsNumeric(s) Then
        Select Case Len(s)
            Case 1, 2
                h = 0: m = CLng(s)
            Case Else
                h = CLng(Left(s, Len(s) - 2))
                m = CLng(Right(s, 2))
        End Select
    Else
        GoTo Bad
    End If

    If h < 0 Or h > 23 Or m < 0 Or m > 59 Then GoTo Bad

    t = TimeSerial(h, m, 0)
    TryParseClock24 = True
    Exit Function

Bad:
    MsgBox "Invalid time in '" & fieldName & "'. Use hh:mm or hhmm (00:00–23:59).", vbExclamation
    TryParseClock24 = False
End Function

Private Sub ClearFields()
    Dim ctl As Control
    
    For Each ctl In Me.Controls
        If TypeName(ctl) = "TextBox" Then
            ctl.Value = ""
        ElseIf TypeName(ctl) = "ComboBox" Then
            ctl.Value = ""
        End If
    Next ctl
End Sub



