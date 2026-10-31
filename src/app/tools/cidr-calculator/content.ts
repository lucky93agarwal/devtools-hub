import { ToolContent } from '../../shared/tool-info/tool-info';

export const CIDR_CONTENT: ToolContent = {
  aboutHeading: 'About this CIDR and subnet calculator',
  about:
    'CIDR notation such as 10.0.0.0/16 describes a block of IP addresses: the number after the slash says how many ' +
    'leading bits are fixed. You meet it in cloud VPCs and subnets, firewall and security group rules, Kubernetes ' +
    'pod ranges and allow lists. Enter a block to see its network and broadcast address, host range, subnet and ' +
    'wildcard masks, size and type (private, public, loopback and so on). Check whether an address is inside it, ' +
    'and split it into smaller subnets. IPv4 and IPv6 are both supported.',
  steps: [
    'Enter a CIDR block such as 10.0.0.0/16, an address with a mask such as 192.168.1.10 255.255.255.0, or an IPv6 block.',
    'Read the network, host range, masks and number of addresses.',
    'Type an address under Is an address in this block? to check a firewall or allow-list rule.',
    'Choose a subnet size to plan subnets, for example /24 blocks inside a /16 VPC.',
  ],
  faq: [
    {
      question: 'How many hosts does a /24 have?',
      answer:
        'A /24 has 256 addresses. In IPv4 the first (network) and last (broadcast) cannot be given to hosts, which ' +
        'leaves 254. Cloud providers often reserve a few more; AWS keeps 5 in every subnet.',
    },
    {
      question: 'What is a wildcard mask?',
      answer:
        'The inverse of the subnet mask: 0.0.255.255 for a /16. Cisco access lists and OSPF use it instead of a subnet mask.',
    },
    {
      question: 'Which ranges are private?',
      answer:
        'In IPv4, 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 (RFC 1918). In IPv6, unique local addresses in ' +
        'fc00::/7. These are not routed on the public internet.',
    },
    {
      question: 'What do /31 and /32 mean?',
      answer:
        'A /32 is one IPv4 address, often used in firewall rules. A /31 has two addresses and is used for ' +
        'point-to-point links, where both can be used by hosts.',
    },
  ],
};
