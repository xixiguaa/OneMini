"""OneMini 内置演示 MCP Server（stdio）。用于验证 MCP Client 连通性。"""

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("onemini-demo")


@mcp.tool()
def echo(text: str) -> str:
    """回显输入文本，用于连通性测试。"""
    return text


@mcp.tool()
def add(a: float, b: float) -> float:
    """将两个数字相加。"""
    return a + b


if __name__ == "__main__":
    mcp.run()
