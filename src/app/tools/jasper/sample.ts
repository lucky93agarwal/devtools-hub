/** A small invoice-style report and data used as samples by the Jaspersoft tools. */
export const SAMPLE_JRXML = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
\txsi:schemaLocation="http://jasperreports.sourceforge.net/jasperreports http://jasperreports.sourceforge.net/xsd/jasperreport.xsd"
\tname="orders_report" pageWidth="595" pageHeight="842" columnWidth="555" leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
\t<parameter name="COMPANY" class="java.lang.String">
\t\t<defaultValueExpression><![CDATA["Acme Pvt Ltd"]]></defaultValueExpression>
\t</parameter>
\t<field name="orderId" class="java.lang.Integer"/>
\t<field name="customer" class="java.lang.String"/>
\t<field name="orderDate" class="java.util.Date"/>
\t<field name="amount" class="java.math.BigDecimal"/>
\t<field name="status" class="java.lang.String"/>
\t<variable name="TOTAL" class="java.math.BigDecimal" calculation="Sum">
\t\t<variableExpression><![CDATA[$F{amount}]]></variableExpression>
\t</variable>
\t<title>
\t\t<band height="60">
\t\t\t<textField>
\t\t\t\t<reportElement x="0" y="0" width="555" height="30" forecolor="#4F46E5"/>
\t\t\t\t<textElement><font size="20" isBold="true"/></textElement>
\t\t\t\t<textFieldExpression><![CDATA[$P{COMPANY} + " - Orders"]]></textFieldExpression>
\t\t\t</textField>
\t\t\t<textField>
\t\t\t\t<reportElement x="0" y="34" width="555" height="16" forecolor="#666666"/>
\t\t\t\t<textFieldExpression><![CDATA["Generated on " + new java.text.SimpleDateFormat("dd MMM yyyy").format(new java.util.Date())]]></textFieldExpression>
\t\t\t</textField>
\t\t</band>
\t</title>
\t<columnHeader>
\t\t<band height="24">
\t\t\t<rectangle><reportElement x="0" y="0" width="555" height="24" backcolor="#EEF0FF"/></rectangle>
\t\t\t<staticText><reportElement x="5" y="4" width="70" height="16"/><textElement><font isBold="true"/></textElement><text><![CDATA[Order #]]></text></staticText>
\t\t\t<staticText><reportElement x="80" y="4" width="200" height="16"/><textElement><font isBold="true"/></textElement><text><![CDATA[Customer]]></text></staticText>
\t\t\t<staticText><reportElement x="285" y="4" width="90" height="16"/><textElement><font isBold="true"/></textElement><text><![CDATA[Date]]></text></staticText>
\t\t\t<staticText><reportElement x="380" y="4" width="80" height="16"/><textElement textAlignment="Right"><font isBold="true"/></textElement><text><![CDATA[Amount]]></text></staticText>
\t\t\t<staticText><reportElement x="470" y="4" width="80" height="16"/><textElement><font isBold="true"/></textElement><text><![CDATA[Status]]></text></staticText>
\t\t</band>
\t</columnHeader>
\t<detail>
\t\t<band height="20">
\t\t\t<textField><reportElement x="5" y="2" width="70" height="16"/><textFieldExpression><![CDATA[$F{orderId}]]></textFieldExpression></textField>
\t\t\t<textField><reportElement x="80" y="2" width="200" height="16"/><textFieldExpression><![CDATA[$F{customer}]]></textFieldExpression></textField>
\t\t\t<textField pattern="dd/MM/yyyy"><reportElement x="285" y="2" width="90" height="16"/><textFieldExpression><![CDATA[$F{orderDate}]]></textFieldExpression></textField>
\t\t\t<textField pattern="#,##0.00"><reportElement x="380" y="2" width="80" height="16"/><textElement textAlignment="Right"/><textFieldExpression><![CDATA[$F{amount}]]></textFieldExpression></textField>
\t\t\t<textField><reportElement x="470" y="2" width="80" height="16"/><textFieldExpression><![CDATA[$F{status} == null ? "-" : $F{status}.toUpperCase()]]></textFieldExpression></textField>
\t\t\t<line><reportElement x="0" y="19" width="555" height="1" forecolor="#DDDDDD"/></line>
\t\t</band>
\t</detail>
\t<pageFooter>
\t\t<band height="20">
\t\t\t<textField><reportElement x="355" y="2" width="150" height="16"/><textElement textAlignment="Right"/><textFieldExpression><![CDATA["Page " + $V{PAGE_NUMBER} + " of"]]></textFieldExpression></textField>
\t\t\t<textField evaluationTime="Report"><reportElement x="505" y="2" width="50" height="16"/><textFieldExpression><![CDATA[" " + $V{PAGE_NUMBER}]]></textFieldExpression></textField>
\t\t</band>
\t</pageFooter>
\t<summary>
\t\t<band height="30">
\t\t\t<staticText><reportElement x="250" y="8" width="100" height="16"/><textElement textAlignment="Right"><font isBold="true"/></textElement><text><![CDATA[Total]]></text></staticText>
\t\t\t<textField pattern="₹ #,##0.00"><reportElement x="355" y="8" width="105" height="16"/><textElement textAlignment="Right"><font isBold="true"/></textElement><textFieldExpression><![CDATA[$V{TOTAL}]]></textFieldExpression></textField>
\t\t</band>
\t</summary>
</jasperReport>
`;

export const SAMPLE_DATA = JSON.stringify(
  [
    { orderId: 1001, customer: 'Asha Rao', orderDate: '2026-11-02', amount: 2499, status: 'paid' },
    { orderId: 1002, customer: 'Ravi Kumar', orderDate: '2026-11-05', amount: 799.5, status: 'pending' },
    { orderId: 1003, customer: 'Meera Shah', orderDate: '2026-11-11', amount: 12000, status: 'paid' },
    { orderId: 1004, customer: 'Imran Khan', orderDate: '2026-11-19', amount: 350, status: null },
  ],
  null,
  2,
);
