Attribute VB_Name = "CountDutyType"
Function CountDutyType(dutyType As String, dutyRange As Range) As Long
    Dim cell As Range, parts() As String
    Dim part As String, i As Long
    Dim count As Long, qty As Long
    Dim symbol As String

    dutyType = UCase(Trim(dutyType))

    For Each cell In dutyRange
        If Not IsEmpty(cell.Value) Then
            parts = Split(UCase(cell.Value), "/")
            For i = LBound(parts) To UBound(parts)
                part = Trim(parts(i))
                qty = 1
                symbol = part

                ' Check if part starts with a number (e.g. 2G)
                If IsNumeric(Left(part, 1)) Then
                    qty = val(part)
                    symbol = Mid(part, Len(CStr(qty)) + 1)
                End If

                If symbol = dutyType Then
                    count = count + qty
                End If
            Next i
        End If
    Next cell

    CountDutyType = count
End Function
Sub FormatRawDataNewRows()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets("RawData")

    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.count, 1).End(xlUp).row

    Dim i As Long
    For i = 2 To lastRow ' Skip header
        ' Date column A
        ws.Cells(i, 1).NumberFormat = "dd-mmm-yyyy"
        ' OT column E
        ws.Cells(i, 5).NumberFormat = "[h]:mm"
        ' Mileage column F
        ws.Cells(i, 6).NumberFormat = "0.00"
        ' Remarks column G
        ws.Cells(i, 7).NumberFormat = "General"
    Next i
End Sub
Sub PrintAndExport_OP72_Custom()

    Dim ws As Worksheet
    Dim rng As Range
    Dim saveDialog As FileDialog
    Dim fileName As String

    Set ws = ThisWorkbook.Sheets("OP-72")
    Set rng = ws.Range("A1:Y55")

    ' === Setup Page ===
    With ws.PageSetup
        .PrintArea = rng.Address
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = 1
        .Orientation = xlLandscape
        .CenterHorizontally = True
        .CenterVertically = True
        .PaperSize = xlPaperA4
    End With

    ' === Get Save Location + Custom Name ===
    Set saveDialog = Application.FileDialog(msoFileDialogSaveAs)
    With saveDialog
        .Title = "Save OP-72 PDF"
        .InitialFileName = "OP72_Report_" & Format(Date, "ddmmyy")
        .FilterIndex = 2
        .AllowMultiSelect = False

        If .Show <> -1 Then
            MsgBox "PDF Export cancelled.", vbExclamation
            Exit Sub
        End If

        fileName = .SelectedItems(1)
        If Right(LCase(fileName), 4) <> ".pdf" Then
            fileName = fileName & ".pdf"
        End If
    End With

    ' === Export to PDF ===
    On Error Resume Next
    rng.ExportAsFixedFormat Type:=xlTypePDF, fileName:=fileName, _
        Quality:=xlQualityStandard, IncludeDocProperties:=True, _
        IgnorePrintAreas:=False, OpenAfterPublish:=True
    On Error GoTo 0

    ' === Print Preview ===
    ws.PrintPreview

End Sub
Sub RefreshAndUpdate_OP72()

    On Error GoTo Handler

    Application.ScreenUpdating = False
    Application.EnableEvents = False

    ' Step 1: Load all employee data
    Call LoadAllEmployees_OP72_Multi

    ' Step 2: Update summary with coloring
    Call UpdateSummaryFinalExclusiveColorFix_Multi

    ' Optional: Confirmation message
    MsgBox "? OP-72 refreshed and summary updated successfully!", vbInformation

CleanUp:
    Application.ScreenUpdating = True
    Application.EnableEvents = True
    Exit Sub

Handler:
    MsgBox "? Error occurred: " & Err.Description, vbCritical
    Resume CleanUp

End Sub
Sub Clear_OP72_Selective()

    Dim ws As Worksheet
    Dim response As VbMsgBoxResult
    Set ws = ThisWorkbook.Sheets("OP-72")

    response = MsgBox("?? This will clear:" & vbCrLf & _
                      "- B3:Y37 (Main data block)" & vbCrLf & _
                      "- A34:A37 (Late entry employee names)" & vbCrLf & _
                      "- And remove background colors from B3:Y37" & vbCrLf & vbCrLf & _
                      "Do you want to continue?", vbYesNo + vbQuestion, "Clear Sheet")

    If response = vbNo Then Exit Sub

    Application.ScreenUpdating = False

    ' Clear main data block
    With ws.Range("B3:Y37")
        .ClearContents
        .Interior.ColorIndex = xlNone ' Clear background colors (e.g. Sunday/Gazetted)
    End With

    ' Clear late entry employee names
    ws.Range("A34:A37").ClearContents

    Application.ScreenUpdating = True

    MsgBox "? Selected data & formatting cleared successfully!", vbInformation

End Sub


